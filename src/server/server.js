import express from 'express';
import cors from 'cors';
import { getIngredientSuggestions, getIngredientNutrition } from '../api/autocomplete.js';
import sql from 'mssql';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Add request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 second timeout
  res.setTimeout(30000);
  next();
});

const dbConfig = {
  server: 'betterchoice-sql.database.windows.net',
  database: 'db_products',
  user: 'betterqsladmin',
  password: '1apple2balls!',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000, // 30 seconds
    requestTimeout: 30000, // 30 seconds
    cancelTimeout: 5000, // 5 seconds
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  }
};

// Global connection pool
let poolPromise;

// Initialize connection pool
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database connection pool...');
    poolPromise = new sql.ConnectionPool(dbConfig);
    
    poolPromise.on('connect', () => {
      console.log('✅ Database connected successfully');
    });
    
    poolPromise.on('error', err => {
      console.error('❌ Database pool error:', err);
    });
    
    await poolPromise.connect();
    console.log('✅ Database pool initialized');
    
    return poolPromise;
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
    throw err;
  }
}

// Get connection from pool with retry logic
async function getConnection() {
  try {
    if (!poolPromise) {
      poolPromise = await initializeDatabase();
    }
    return poolPromise;
  } catch (err) {
    console.error('❌ Error getting database connection:', err);
    throw err;
  }
}

// Enhanced error handler
function handleDatabaseError(err, res, operation) {
  console.error(`❌ Database error in ${operation}:`, err);
  
  if (err.code === 'ETIMEOUT') {
    return res.status(504).json({ error: 'Database query timed out. Please try again.' });
  } else if (err.code === 'ECONNRESET') {
    return res.status(503).json({ error: 'Database connection reset. Please try again.' });
  } else if (err.code === 'ENOTFOUND') {
    return res.status(503).json({ error: 'Database server not found. Please try again later.' });
  } else {
    return res.status(500).json({ error: `Database operation failed: ${err.message}` });
  }
}

// Suggestions endpoint
app.get('/api/suggestions', async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    if (!query || query.length < 2) return res.json({ suggestions: [], hasMore: false });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    console.log(`🔍 Fetching suggestions for: "${query}" (page: ${pageNum}, limit: ${limitNum}, offset: ${offset})`);
    const suggestions = await getIngredientSuggestions(query, limitNum, offset);
    console.log(`✅ Suggestions returned: ${suggestions.length} results`);
    
    // Debug: Check if gtinUpc is included in suggestions
    suggestions.forEach((suggestion, index) => {
      console.log(`  Suggestion ${index}: ${suggestion.hebrew || suggestion.english} - gtinUpc: "${suggestion.gtinUpc}"`);
    });
    
    const hasMore = suggestions.length === limitNum;

    res.json({
      suggestions,
      hasMore,
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error in /api/suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Ingredient nutrition endpoint
app.get('/api/ingredient-nutrition', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Ingredient name is required' });

    console.log('Fetching nutrition for:', name);
    const nutritionData = await getIngredientNutrition(name);
    console.log('Nutrition data:', nutritionData);
    res.json(nutritionData);
  } catch (error) {
    console.error('Error in /api/ingredient-nutrition:', error);
    res.status(500).json({ error: 'Failed to fetch nutrition data' });
  }
});

// UPC lookup endpoint with improved connection handling
app.get('/api/ingredient-upc', async (req, res) => {
  const { brand, name } = req.query;
  if (!brand || !name) {
    return res.status(400).json({ 
      error: 'Both "brand" and "name" query parameters are required.' 
    });
  }

  console.log(`🔍 UPC lookup: brand="${brand}", name="${name}"`);

  // Split the name into non-empty terms
  const terms = name
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);

  try {
    const pool = await getConnection();
    const request = pool.request();

    // Set request timeout
    request.timeout = 60000; // 60 seconds - increased for complex searches

    // Bind brand parameter
    request.input('brand', sql.NVarChar, brand);

    // Bind each name term
    terms.forEach((term, i) => {
      request.input(`term${i}`, sql.NVarChar, term);
    });

    // Build WHERE clause
    const nameClauses = terms
      .map((_, i) => `english_name LIKE N'%' + @term${i} + '%'`)
      .join('\n    AND ');
    
    const whereClause = `
      brand LIKE N'%' + @brand + '%'
      AND ${nameClauses}
    `;

    const sqlText = `
      SELECT TOP 1 gtinUpc AS upc
      FROM foods_storage WITH (NOLOCK)
      WHERE ${whereClause}
      ORDER BY LEN(english_name)
    `;

    console.log(`📊 Executing UPC query for ${brand} ${name}`);
    const result = await request.query(sqlText);
    const upc = result.recordset[0]?.upc ?? null;
    
    console.log(`✅ UPC result: ${upc || 'not found'}`);
    res.json({ upc });

  } catch (err) {
    handleDatabaseError(err, res, 'ingredient-upc');
  }
});

// Hebrew UPC lookup endpoint with improved connection handling
app.get('/api/ingredient-upc-hebrew', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ 
      error: 'Missing "query" parameter. E.g. ?query=Buttermilk Tnuva' 
    });
  }

  console.log(`🔍 Hebrew UPC lookup: query="${query}"`);

  // Define processing words that shouldn't heavily influence scoring
  const processingWords = [
    'chopped', 'smashed', 'cut', 'sliced', 'diced', 'minced', 'grated', 'shredded',
    'frozen', 'fresh', 'raw', 'cooked', 'baked', 'fried', 'grilled', 'roasted',
    'dried', 'canned', 'jarred', 'packaged', 'prepared', 'ready', 'instant',
    'organic', 'natural', 'artificial', 'sweetened', 'unsweetened', 'low', 'high',
    'light', 'heavy', 'thick', 'thin', 'large', 'small', 'mini', 'regular',
    'extra', 'premium', 'standard', 'basic', 'deluxe', 'classic', 'traditional'
  ];

  // Split on spaces, drop any empties, and normalize
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(term => term.replace(/[^\w\s]/g, '')); // Remove special characters

  if (terms.length === 0) {
    return res.status(400).json({ error: 'No valid search terms found' });
  }

  // Smart brand and product separation
  let brandName = '';
  let productName = '';
  
  // Common Israeli brands (we'll use this to identify brands in the query)
  const knownBrands = ['tnuva', 'tara', 'strauss', 'yotvata', 'harduf', 'gad', 'danone', 'nestle', 'feldman', 'osem', 'telma', 'angel', 'elite', 'shufersal', 'ramilevy', 'coop', 'victory'];
  
  // Find brand in the query
  const foundBrand = terms.find(term => knownBrands.includes(term));
  if (foundBrand) {
    brandName = foundBrand;
    // Remove brand from terms to get product name
    const productTerms = terms.filter(term => term !== foundBrand);
    productName = productTerms.join(' ');
  } else {
    // If no known brand found, assume first word might be brand
    brandName = terms[0];
    productName = terms.slice(1).join(' ');
  }

  console.log(`🔍 Separated query: Brand="${brandName}", Product="${productName}"`);

  // Create search terms for product (limit to most important terms)
  const productTerms = productName
    .split(/\s+/)
    .filter(Boolean)
    .map(term => term.replace(/[^\w\s]/g, ''))
    .filter(term => !processingWords.includes(term.toLowerCase()))
    .slice(0, 3); // Limit to first 3 terms to speed up search

  // Extract numeric terms from product
  const numericTerms = productTerms.filter(term => 
    /^\d+%?$/.test(term) || /^\d+\.\d+%?$/.test(term)
  );

  // Extract processing words from original product name for bonus scoring
  const originalProductTerms = productName
    .split(/\s+/)
    .filter(Boolean)
    .map(term => term.replace(/[^\w\s]/g, ''));
    
  const processingTerms = originalProductTerms.filter(term => 
    processingWords.includes(term.toLowerCase())
  );

  // Debug logging
  console.log(`📋 Search breakdown:`, {
    originalQuery: query,
    brandName,
    productName,
    productTerms,
    processingTerms,
    numericTerms
  });

  try {
    const pool = await getConnection();
    const request = pool.request();

    // Set request timeout
    request.timeout = 60000; // 60 seconds - increased for complex searches

    // Create optimized search strategies (reduced from 7 to 3)
    const searchStrategies = [];

    // Strategy 1: First Word + Brand Match (highest priority)
    if (brandName && productTerms.length > 0) {
      request.input('brand', sql.NVarChar, brandName);
      
      const productClauses = productTerms.map((term, i) => {
        const key = `firstBrand${i}`;
        request.input(key, sql.NVarChar, term);
        return `LOWER(english_name) LIKE N'%' + @${key} + '%'`;
      });
      
      // Israeli brands filter
      const israeliBrands = ['tnuva', 'tara', 'strauss', 'yotvata', 'harduf', 'gad', 'danone', 'nestle', 'feldman', 'osem', 'telma', 'angel', 'elite', 'shufersal', 'ramilevy', 'coop', 'victory', 'bamba', 'bissli', 'krembo', 'lechem eretz', 'achla', 'taboon', 'dan cake', 'kibutz galuyot', 'machsanei hashuk', 'shamir salads', 'meshek tzuriel', 'priniv', 'shimrit', 'tenuva', 'emek', 'milko', 'para', 'shoko', 'cottage', 'gamadim', 'hashachar', 'zoglovek', 'wilke', 'galil mountain', 'carmel', 'barkan', 'golan heights', 'dalton', 'recanati', 'tabor', 'tulip', 'yarden', 'vita', 'primor', 'meshulam', 'golden star', 'kfar shaul', 'hazirim', 'hatzbani', 'aviv', 'masuah', 'shemen', 'mizra', 'tivall', 'achva', 'halva kingdom'];
      
      const israeliBrandClause = israeliBrands.map(brand => `LOWER(english_name) LIKE N'%${brand}%'`).join(' OR ');
      
      // Add parameter for full product name match
      request.input('fullProductName', sql.NVarChar, productName);
      
      // Add parameters for processing terms
      const processingClauses = processingTerms.map((term, i) => {
        const key = `processing${i}`;
        request.input(key, sql.NVarChar, term);
        return `CASE WHEN LOWER(english_name) LIKE N'%' + @${key} + '%' THEN 3 ELSE 0 END`;
      }).join(' + ');
      
      searchStrategies.push({
        name: 'first_word_brand_match',
        sql: `SELECT TOP 10 gtinUpc AS upc, english_name,
               CASE WHEN LOWER(english_name) LIKE LOWER(@fullProductName) + N'%' THEN 80 ELSE 0 END +
               (${productClauses.map((_, i) => `CASE WHEN LOWER(english_name) LIKE @firstBrand${i} + N'%' THEN 40 ELSE CASE WHEN LOWER(english_name) LIKE N'%' + @firstBrand${i} + '%' THEN 5 ELSE 0 END END`).join(' + ')}) +
               CASE WHEN LOWER(english_name) LIKE N'%' + @brand + '%' THEN 8 ELSE 0 END +
               CASE WHEN (${israeliBrandClause}) THEN 3 ELSE 0 END +
               ${processingClauses ? `+ ${processingClauses}` : ''} +
               CASE WHEN LOWER(english_name) LIKE N'%raw%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%fresh%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%without peel%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%sticks%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%sliced%' THEN 1 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%mini%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%with%' THEN -3 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%drink%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%yoghurt%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%milk%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%fat%' THEN -3 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%%' THEN -2 ELSE 0 END as total_score
               FROM foods_storage WITH (NOLOCK)
               WHERE LOWER(english_name) LIKE N'%' + @brand + '%' AND (${productClauses.join(' OR ')})
               AND LEN(gtinUpc) = 8 AND ISNUMERIC(gtinUpc) = 1
               ORDER BY total_score DESC`,
        weight: 150
      });
    }

    // Strategy 2: First Word Match Only (high priority)
    if (productTerms.length > 0) {
      const productClauses = productTerms.map((term, i) => {
        const key = `first${i}`;
        request.input(key, sql.NVarChar, term);
        return `LOWER(english_name) LIKE N'%' + @${key} + '%'`;
      });
      
      // Israeli brands filter
      const israeliBrands = ['tnuva', 'tara', 'strauss', 'yotvata', 'harduf', 'gad', 'danone', 'nestle', 'feldman', 'osem', 'telma', 'angel', 'elite', 'shufersal', 'ramilevy', 'coop', 'victory', 'bamba', 'bissli', 'krembo', 'lechem eretz', 'achla', 'taboon', 'dan cake', 'kibutz galuyot', 'machsanei hashuk', 'shamir salads', 'meshek tzuriel', 'priniv', 'shimrit', 'tenuva', 'emek', 'milko', 'para', 'shoko', 'cottage', 'gamadim', 'hashachar', 'zoglovek', 'wilke', 'galil mountain', 'carmel', 'barkan', 'golan heights', 'dalton', 'recanati', 'tabor', 'tulip', 'yarden', 'vita', 'primor', 'meshulam', 'golden star', 'kfar shaul', 'hazirim', 'hatzbani', 'aviv', 'masuah', 'shemen', 'mizra', 'tivall', 'achva', 'halva kingdom'];
      
      const israeliBrandClause = israeliBrands.map(brand => `LOWER(english_name) LIKE N'%${brand}%'`).join(' OR ');
      
      // Add parameter for full product name match
      request.input('fullProductName2', sql.NVarChar, productName);
      
      // Add parameters for processing terms
      const processingClauses2 = processingTerms.map((term, i) => {
        const key = `processing2${i}`;
        request.input(key, sql.NVarChar, term);
        return `CASE WHEN LOWER(english_name) LIKE N'%' + @${key} + '%' THEN 3 ELSE 0 END`;
      }).join(' + ');
      
      searchStrategies.push({
        name: 'first_word_match',
        sql: `SELECT TOP 10 gtinUpc AS upc, english_name,
               CASE WHEN LOWER(english_name) LIKE LOWER(@fullProductName2) + N'%' THEN 80 ELSE 0 END +
               (${productClauses.map((_, i) => `CASE WHEN LOWER(english_name) LIKE @first${i} + N'%' THEN 40 ELSE CASE WHEN LOWER(english_name) LIKE N'%' + @first${i} + '%' THEN 5 ELSE 0 END END`).join(' + ')}) +
               CASE WHEN (${israeliBrandClause}) THEN 3 ELSE 0 END +
               ${processingClauses2 ? `+ ${processingClauses2}` : ''} +
               CASE WHEN LOWER(english_name) LIKE N'%raw%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%fresh%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%without peel%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%sticks%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%sliced%' THEN 1 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%mini%' THEN 2 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%with%' THEN -3 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%drink%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%yoghurt%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%milk%' THEN -5 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%fat%' THEN -3 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%%' THEN -2 ELSE 0 END as total_score
               FROM foods_storage WITH (NOLOCK)
               WHERE (${productClauses.join(' OR ')})
               AND LEN(gtinUpc) = 8 AND ISNUMERIC(gtinUpc) = 1
               ORDER BY total_score DESC`,
        weight: 120
      });
    }

    // Strategy 3: Israeli Brand + Product Priority (medium weight)
    if (brandName && productTerms.length > 0) {
      request.input('brand3', sql.NVarChar, brandName);
      
      const productClauses = productTerms.map((term, i) => {
        const key = `product3${i}`;
        request.input(key, sql.NVarChar, term);
        return `LOWER(english_name) LIKE N'%' + @${key} + '%'`;
      });
      
      // Israeli brands filter
      const israeliBrands = ['tnuva', 'tara', 'strauss', 'yotvata', 'harduf', 'gad', 'danone', 'nestle', 'feldman', 'osem', 'telma', 'angel', 'elite', 'shufersal', 'ramilevy', 'coop', 'victory', 'bamba', 'bissli', 'krembo', 'lechem eretz', 'achla', 'taboon', 'dan cake', 'kibutz galuyot', 'machsanei hashuk', 'shamir salads', 'meshek tzuriel', 'priniv', 'shimrit', 'tenuva', 'emek', 'milko', 'para', 'shoko', 'cottage', 'gamadim', 'hashachar', 'zoglovek', 'wilke', 'galil mountain', 'carmel', 'barkan', 'golan heights', 'dalton', 'recanati', 'tabor', 'tulip', 'yarden', 'vita', 'primor', 'meshulam', 'golden star', 'kfar shaul', 'hazirim', 'hatzbani', 'aviv', 'masuah', 'shemen', 'mizra', 'tivall', 'achva', 'halva kingdom'];
      
      const israeliBrandClause = israeliBrands.map(brand => `LOWER(english_name) LIKE N'%${brand}%'`).join(' OR ');
      
      // Add parameter for full product name match
      request.input('fullProductName3', sql.NVarChar, productName);
      
      searchStrategies.push({
        name: 'israeli_brand_product_priority',
        sql: `SELECT TOP 10 gtinUpc AS upc, english_name,
               CASE WHEN LOWER(english_name) LIKE LOWER(@fullProductName3) + N'%' THEN 50 ELSE 0 END +
               CASE WHEN LOWER(english_name) LIKE N'%' + @brand3 + '%' THEN 10 ELSE 0 END +
               (${productClauses.map((_, i) => `CASE WHEN LOWER(english_name) LIKE N'%' + @product3${i} + '%' THEN 3 ELSE 0 END`).join(' + ')}) +
               CASE WHEN (${israeliBrandClause}) THEN 5 ELSE 0 END as total_score
               FROM foods_storage WITH (NOLOCK)
               WHERE LOWER(english_name) LIKE N'%' + @brand3 + '%' AND (${productClauses.join(' OR ')})
               AND LEN(gtinUpc) = 8 AND ISNUMERIC(gtinUpc) = 1
               ORDER BY total_score DESC`,
        weight: 100
      });
    }

    // Strategy 4: Israeli Products with Product Terms (low weight)
    if (productTerms.length > 0) {
      const productClauses = productTerms.map((term, i) => {
        const key = `product2${i}`;
        request.input(key, sql.NVarChar, term);
        return `LOWER(english_name) LIKE N'%' + @${key} + '%'`;
      });
      
      // Israeli brands filter
      const israeliBrands = ['tnuva', 'tara', 'strauss', 'yotvata', 'harduf', 'gad', 'danone', 'nestle', 'feldman', 'osem', 'telma', 'angel', 'elite', 'shufersal', 'ramilevy', 'coop', 'victory', 'bamba', 'bissli', 'krembo', 'lechem eretz', 'achla', 'taboon', 'dan cake', 'kibutz galuyot', 'machsanei hashuk', 'shamir salads', 'meshek tzuriel', 'priniv', 'shimrit', 'tenuva', 'emek', 'milko', 'para', 'shoko', 'cottage', 'gamadim', 'hashachar', 'zoglovek', 'wilke', 'galil mountain', 'carmel', 'barkan', 'golan heights', 'dalton', 'recanati', 'tabor', 'tulip', 'yarden', 'vita', 'primor', 'meshulam', 'golden star', 'kfar shaul', 'hazirim', 'hatzbani', 'aviv', 'masuah', 'shemen', 'mizra', 'tivall', 'achva', 'halva kingdom'];
      
      const israeliBrandClause = israeliBrands.map(brand => `LOWER(english_name) LIKE N'%${brand}%'`).join(' OR ');
      
      searchStrategies.push({
        name: 'israeli_products_with_terms',
        sql: `SELECT TOP 10 gtinUpc AS upc, english_name,
               (${productClauses.map((_, i) => `CASE WHEN LOWER(english_name) LIKE N'%' + @product2${i} + '%' THEN 3 ELSE 0 END`).join(' + ')}) +
               CASE WHEN (${israeliBrandClause}) THEN 8 ELSE 0 END as total_score
               FROM foods_storage WITH (NOLOCK)
               WHERE (${productClauses.join(' OR ')})
               AND LEN(gtinUpc) = 8 AND ISNUMERIC(gtinUpc) = 1
               ORDER BY total_score DESC`,
        weight: 90
      });
    }

    // Strategy 5: Simple fallback - any term match
    const allTerms = [brandName, ...productTerms].filter(Boolean);
    if (allTerms.length > 0) {
      const fallbackClauses = allTerms.map((term, i) => {
        const key = `fallback${i}`;
        request.input(key, sql.NVarChar, term);
        return `LOWER(english_name) LIKE N'%' + @${key} + '%'`;
      });
      
      searchStrategies.push({
        name: 'fallback_match',
        sql: `SELECT TOP 10 gtinUpc AS upc, english_name,
               (${fallbackClauses.map((_, i) => `CASE WHEN LOWER(english_name) LIKE N'%' + @fallback${i} + '%' THEN 1 ELSE 0 END`).join(' + ')}) as matched_terms
               FROM foods_storage WITH (NOLOCK)
               WHERE (${fallbackClauses.join(' OR ')})
               AND LEN(gtinUpc) = 8 AND ISNUMERIC(gtinUpc) = 1
               ORDER BY matched_terms DESC`,
        weight: 50
      });
    }

    // Execute strategies and combine results (optimized)
    const allResults = [];
    
    for (const strategy of searchStrategies) {
      try {
        console.log(`📊 Executing ${strategy.name} strategy for: ${query}`);
        const result = await request.query(strategy.sql);
        
        console.log(`📋 Strategy ${strategy.name} returned ${result.recordset.length} results`);
        
        result.recordset.forEach(row => {
          const existingIndex = allResults.findIndex(r => r.upc === row.upc);
          const currentScore = row.total_score || row.matched_terms || 0;
          
          // Calculate final score
          const finalScore = currentScore * strategy.weight / 100;
          
          if (existingIndex >= 0) {
            // Update existing result with higher score
            const existing = allResults[existingIndex];
            const newScore = Math.max(existing.score, finalScore);
            allResults[existingIndex] = { ...existing, score: newScore };
          } else {
            // Add new result
            allResults.push({
              upc: row.upc,
              english_name: row.english_name,
              score: finalScore,
              brandMatch: brandName && row.english_name?.toLowerCase().includes(brandName.toLowerCase())
            });
          }
        });
        
        console.log(`📊 Total results so far: ${allResults.length}`);
        
        // Early exit if we found good results from high-priority strategy
        if (strategy.weight >= 80 && allResults.length >= 5) {
          console.log(`✅ Found ${allResults.length} results from high-priority strategy, stopping early`);
          break;
        }
      } catch (strategyErr) {
        console.error(`❌ Strategy ${strategy.name} failed:`, strategyErr.message);
        console.error(`❌ Full error:`, strategyErr);
        // Continue with other strategies
      }
    }
    
    console.log(`📊 Created ${searchStrategies.length} strategies:`, searchStrategies.map(s => s.name));
    console.log(`📊 Executed ${searchStrategies.length} strategies, found ${allResults.length} total results`);

    // Sort by score and return best match
    allResults.sort((a, b) => b.score - a.score);
    
    const bestMatch = allResults[0];
    const upc = bestMatch?.upc ?? null;
    
    console.log(`✅ Hebrew UPC result: ${upc || 'not found'} (score: ${bestMatch?.score || 0})`);
    console.log(`📋 Found ${allResults.length} potential matches`);
    
    if (allResults.length > 0) {
      console.log(`🏆 Top 3 matches:`);
      allResults.slice(0, 3).forEach((match, i) => {
        const brandInfo = match.brandMatch ? ' [BRAND MATCH]' : '';
        console.log(`  ${i + 1}. ${match.english_name} (UPC: ${match.upc}, Score: ${match.score})${brandInfo}`);
      });
    }
    
    res.json({ 
      upc,
      total_matches: allResults.length,
      top_matches: allResults.slice(0, 3).map(m => ({ upc: m.upc, name: m.english_name, score: m.score }))
    });
    
  } catch (err) {
    console.error(`❌ Search failed for query "${query}":`, err.message);
    handleDatabaseError(err, res, 'ingredient-upc-hebrew');
  }
});

// Health check endpoints (multiple paths for compatibility)
const healthCheck = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT 1 as test');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Health check failed:', err);
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Multiple health check endpoints for different platforms
app.get('/health', healthCheck);
app.get('/healthz', healthCheck);
app.get('/health-check', healthCheck);
app.get('/', healthCheck); // Root endpoint as health check

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  try {
    if (poolPromise) {
      await poolPromise.close();
      console.log('✅ Database pool closed');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  try {
    if (poolPromise) {
      await poolPromise.close();
      console.log('✅ Database pool closed');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
});

// Initialize database when server starts
initializeDatabase().catch(err => {
  console.error('❌ Failed to initialize database on startup:', err);
  // Don't exit - let the server try to reconnect on demand
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔗 Health check: https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/:${port}/health`);
});
