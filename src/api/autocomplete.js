import sql from 'mssql';

// הגדרות התחברות ל-Azure SQL
const config = {
  server: 'betterchoice-sql.database.windows.net',
  database: 'db_products',
  user: 'betterqsladmin',
  password: '1apple2balls!',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Create a connection pool that we'll reuse
let pool;
const getPool = async () => {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
};

// פונקציה שמחזירה הצעות השלמה על בסיס קלט המשתמש
export async function getIngredientSuggestions(query) {
  if (!query || query.length < 2) return [];

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, query)
      .query(`
        SELECT TOP 10 english_name, hebrew_name
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

    return result.recordset.map(row => ({
      english: row.english_name,
      hebrew: row.hebrew_name
    }));
  } catch (err) {
    console.error('Error in getIngredientSuggestions:', err);
    return [];
  }
}

export async function getIngredientNutrition(englishName) {
  if (!englishName) return null;

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar, englishName)
      .query(`
        SELECT 
          Energy,
          Protein,
          Total_lipid__fat_,
          english_name,
          hebrew_name
        FROM foods_storage WITH (NOLOCK)
        WHERE english_name = @name
      `);

    if (result.recordset.length === 0) {
      return {
        Energy: 0,
        Protein: 0,
        Total_lipid__fat_: 0,
        english_name: englishName,
        hebrew_name: ''
      };
    }

    return result.recordset[0];
  } catch (err) {
    console.error('Error in getIngredientNutrition:', err);
    throw err;
  }
}

// Handle cleanup when the server shuts down
process.on('SIGTERM', async () => {
  if (pool) {
    await pool.close();
  }
});
