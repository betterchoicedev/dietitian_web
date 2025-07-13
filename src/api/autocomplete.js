import sql from 'mssql';

// Enhanced Azure SQL configuration with timeouts and pooling
const config = {
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

// Global connection pool with proper error handling
let pool;
let isConnecting = false;

const getPool = async () => {
  if (pool && pool.connected) {
    return pool;
  }

  if (isConnecting) {
    // Wait for existing connection attempt
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return pool;
  }

  try {
    isConnecting = true;
    console.log('🔄 Initializing autocomplete database connection pool...');
    
    pool = new sql.ConnectionPool(config);
    
    pool.on('connect', () => {
      console.log('✅ Autocomplete database connected successfully');
    });
    
    pool.on('error', err => {
      console.error('❌ Autocomplete database pool error:', err);
      pool = null; // Reset pool on error
    });
    
    await pool.connect();
    console.log('✅ Autocomplete database pool initialized');
    
    return pool;
  } catch (err) {
    console.error('❌ Failed to initialize autocomplete database:', err);
    pool = null; // Reset pool on error
    throw err;
  } finally {
    isConnecting = false;
  }
};

// Enhanced error handling
function handleDatabaseError(operation, err) {
  console.error(`❌ Database error in ${operation}:`, err);
  
  if (err.code === 'ETIMEOUT') {
    console.error(`⏰ Timeout in ${operation}`);
  } else if (err.code === 'ECONNRESET') {
    console.error(`🔌 Connection reset in ${operation}`);
  } else if (err.code === 'ENOTFOUND') {
    console.error(`🔍 Database server not found in ${operation}`);
  }
  
  // Reset pool on certain errors to force reconnection
  if (['ECONNRESET', 'ENOTFOUND', 'ETIMEOUT'].includes(err.code)) {
    pool = null;
  }
}

// פונקציה שמחזירה הצעות השלמה על בסיס קלט המשתמש
export async function getIngredientSuggestions(query) {
  if (!query || query.length < 2) return [];

  const startTime = Date.now();
  console.log(`🔍 Getting suggestions for: "${query}"`);

  try {
    const poolConnection = await getPool();
    const request = poolConnection.request();
    
    // Set request timeout
    request.timeout = 25000; // 25 seconds
    
    const result = await request
      .input('search', sql.NVarChar, query)
      .query(`
        SELECT TOP 10
          english_name,
          hebrew_name,
          Energy,
          Protein,
          Total_lipid__fat_,
          Carbohydrate__by_difference
        FROM foods_storage WITH (NOLOCK)
        WHERE english_name LIKE N'%' + @search + '%'
           OR hebrew_name LIKE N'%' + @search + '%'
        ORDER BY 
          CASE 
            WHEN hebrew_name LIKE N'%' + @search + '%' THEN 0
            ELSE 1
          END,
          LEN(hebrew_name)
      `);

    const endTime = Date.now();
    console.log(`✅ Suggestions found: ${result.recordset.length} results in ${endTime - startTime}ms`);

    return result.recordset.map(row => ({
      english: row.english_name,
      hebrew: row.hebrew_name,
      household_measure: '',
      Energy: row.Energy,
      Protein: row.Protein,
      Total_lipid__fat_: row.Total_lipid__fat_,
      Carbohydrate: row.Carbohydrate__by_difference
    }));
  } catch (err) {
    const endTime = Date.now();
    console.error(`❌ Error getting suggestions for "${query}" after ${endTime - startTime}ms:`, err);
    handleDatabaseError('getIngredientSuggestions', err);
    return [];
  }
}

export async function getIngredientNutrition(englishName) {
  if (!englishName) return null;

  const startTime = Date.now();
  console.log(`🔍 Getting nutrition for: "${englishName}"`);

  try {
    const poolConnection = await getPool();
    const request = poolConnection.request();
    
    // Set request timeout
    request.timeout = 25000; // 25 seconds
    
    const result = await request
      .input('name', sql.NVarChar, englishName)
      .query(`
        SELECT 
          Energy,
          Protein,
          Total_lipid__fat_,
          Carbohydrate__by_difference,
          english_name,
          hebrew_name
        FROM foods_storage WITH (NOLOCK)
        WHERE english_name = @name
      `);

    const endTime = Date.now();

    if (result.recordset.length === 0) {
      console.log(`⚠️ No nutrition data found for "${englishName}" in ${endTime - startTime}ms`);
      return {
        Energy: 0,
        Protein: 0,
        Total_lipid__fat_: 0,
        Carbohydrate: 0,
        english_name: englishName,
        hebrew_name: ''
      };
    }

    console.log(`✅ Nutrition data found for "${englishName}" in ${endTime - startTime}ms`);
    return result.recordset[0];
  } catch (err) {
    const endTime = Date.now();
    console.error(`❌ Error getting nutrition for "${englishName}" after ${endTime - startTime}ms:`, err);
    handleDatabaseError('getIngredientNutrition', err);
    throw err;
  }
}

// Graceful shutdown handling
const closePool = async () => {
  if (pool) {
    try {
      console.log('🛑 Closing autocomplete database pool...');
      await pool.close();
      console.log('✅ Autocomplete database pool closed');
      pool = null;
    } catch (err) {
      console.error('❌ Error closing autocomplete database pool:', err);
    }
  }
};

// Handle cleanup when the server shuts down
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

// Export closePool for manual cleanup if needed
export { closePool };
