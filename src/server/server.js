import express from 'express';
import cors from 'cors';
import { getIngredientSuggestions, getIngredientNutrition } from '../api/autocomplete.js';

const app = express();
const port = process.env.PORT || 3001;
import sql from 'mssql';

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const dbConfig = {
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
app.get('/api/ingredient-upc', async (req, res) => {
  const { brand, name } = req.query;
  if (!brand || !name) {
    return res
      .status(400)
      .json({ error: 'Both "brand" and "name" query parameters are required.' });
  }

  // split the name into non-empty terms
  const terms = name
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);

  try {
    const pool   = await sql.connect(dbConfig);
    const request = pool.request();

    // bind brand
    request.input('brand', sql.NVarChar, brand);

    // bind each name-term
    terms.forEach((term, i) => {
      request.input(`term${i}`, sql.NVarChar, term);
    });

    // build WHERE: brand LIKE ... AND english_name LIKE %term0% AND %term1% ...
    const nameClauses = terms
      .map((_, i) => `english_name LIKE N'%' + @term${i} + '%'`)
      .join('\n    AND ');
    const whereClause = `
      brand        LIKE N'%' + @brand + '%'
      AND ${nameClauses}
    `;

    const sqlText = `
      SELECT TOP 1 gtinUpc AS upc
      FROM foods_storage WITH (NOLOCK)
      WHERE ${whereClause}
      ORDER BY LEN(english_name)
    `;

    const result = await request.query(sqlText);
    const upc    = result.recordset[0]?.upc ?? null;
    res.json({ upc });

  } catch (err) {
    console.error('[/api/ingredient-upc] DB error:', err);
    res.status(500).json({ error: 'Database lookup failed.' });
  }
});


app.get('/api/ingredient-upc-hebrew', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res
      .status(400)
      .json({ error: 'Missing “query” parameter. E.g. ?query=Buttermilk Tnuva' });
  }

  // split on spaces, drop any empties
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  try {
    const pool = await sql.connect(dbConfig);
    // build a dynamic WHERE clause: english_name LIKE %term0% AND %term1% AND ...
    const request = pool.request();
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

    const result = await request.query(sqlText);
    const upc = result.recordset[0]?.upc ?? null;
    res.json({ upc });
  } catch (err) {
    console.error('[/api/ingredient-upc-hebrew] DB error:', err);
    res.status(500).json({ error: 'Database lookup failed.' });
  }
});




app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
