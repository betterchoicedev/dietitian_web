import express from 'express';
import cors from 'cors';
import { getIngredientSuggestions, getIngredientNutrition } from '../api/autocomplete.js';

const app = express();
const port = process.env.PORT || 3001;
import express from 'express';
import cors from 'cors';
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
app.use(cors());

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
    return res.status(400).json({ error: 'Both "brand" and "name" are required.' });
  }

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('brand', sql.NVarChar, brand)
      .input('name',  sql.NVarChar, name)
      .query(`
        SELECT TOP 1 gtinUpc AS upc
        FROM foods_storage WITH (NOLOCK)
        WHERE brand LIKE N'%' + @brand + '%'
          AND name  LIKE N'%' + @name  + '%'
      `);

    const upc = result.recordset[0]?.upc ?? null;
    res.json({ upc });
  } catch (err) {
    console.error('[/api/ingredient-upc] DB error:', err);
    res.status(500).json({ error: 'Database lookup failed.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
