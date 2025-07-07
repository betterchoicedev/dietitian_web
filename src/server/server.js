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
    const { query } = req.query;
    if (!query || query.length < 2) return res.json([]);

    const suggestions = await getIngredientSuggestions(query);
    res.json(suggestions);
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
    request.timeout = 25000; // 25 seconds

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

  // Split on spaces, drop any empties
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  try {
    const pool = await getConnection();
    const request = pool.request();

    // Set request timeout
    request.timeout = 25000; // 25 seconds

    // Build dynamic WHERE clause
    const clauses = terms.map((term, i) => {
      const key = `term${i}`;
      request.input(key, sql.NVarChar, term);
      return `english_name LIKE N'%' + @${key} + '%'`;
    });

    const sqlText = `
      SELECT TOP 1 gtinUpc AS upc
      FROM foods_storage WITH (NOLOCK)
      WHERE ${clauses.join(' AND ')}
      ORDER BY LEN(english_name)
    `;

    console.log(`📊 Executing Hebrew UPC query for: ${query}`);
    const result = await request.query(sqlText);
    const upc = result.recordset[0]?.upc ?? null;
    
    console.log(`✅ Hebrew UPC result: ${upc || 'not found'}`);
    res.json({ upc });
    
  } catch (err) {
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
  console.log(`🔗 Health check: http://localhost:${port}/health`);
});
