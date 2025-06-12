const express = require('express');
const router = express.Router();
const getIngredientSuggestions = require('../api/autocomplete');

router.get('/autocomplete', getIngredientSuggestions);
 
module.exports = router; 