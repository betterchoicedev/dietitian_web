const express = require('express');
const cors = require('cors');
const { getIngredientSuggestions, getIngredientNutrition } = require('../api/autocomplete');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS for React app
app.use(cors());

// Suggestions endpoint
app.get('/api/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

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
    
    if (!name) {
      return res.status(400).json({ error: 'Ingredient name is required' });
    }

    console.log('Fetching nutrition for:', name);
    const nutritionData = await getIngredientNutrition(name);
    console.log('Nutrition data:', nutritionData);
    res.json(nutritionData);
    
  } catch (error) {
    console.error('Error in /api/ingredient-nutrition:', error);
    res.status(500).json({ error: 'Failed to fetch nutrition data' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 