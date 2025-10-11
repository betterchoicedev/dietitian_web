import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/card'
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Utensils, Salad, Soup, ChefHat, Sandwich, Printer, Star, Clock, Users, Target, X, BookOpen, Zap } from 'lucide-react';

// Translation caching system to save AI tokens
const CACHE_PREFIX = 'recipe_translations';
const CACHE_EXPIRY_DAYS = 30;

// Function to create cache key for recipe translations
const createRecipeCacheKey = (recipes, targetLang) => {
  try {
    // Create a hash of the recipe content for consistent caching
    const recipeContent = JSON.stringify({
      recipes: recipes.map(group => ({
        group: group.group,
        recipes: group.recipes.map(recipe => ({
          id: recipe.id,
          title: recipe.title,
          instructions: recipe.instructions,
          ingredients: recipe.ingredients,
          tips: recipe.tips
        }))
      }))
    });
    return `${CACHE_PREFIX}_${targetLang}_${btoa(recipeContent).slice(0, 50)}`;
  } catch (error) {
    console.warn('Failed to create cache key:', error);
    return `${CACHE_PREFIX}_${targetLang}_${Date.now()}`;
  }
};

// Function to get cached translation
const getCachedTranslation = (cacheKey) => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const now = Date.now();
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    // Check if cache is expired
    if (parsed._cachedAt && (now - parsed._cachedAt) > maxAge) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return parsed.data;
  } catch (error) {
    console.warn('Failed to read cache:', error);
    localStorage.removeItem(cacheKey);
    return null;
  }
};

// Function to validate and clean cached data
const validateAndCleanCachedData = (cachedData, originalRecipes) => {
  try {
    if (!Array.isArray(cachedData)) {
      console.warn('Cached data is not an array, returning original recipes');
      return originalRecipes;
    }
    
    // Ensure each group has the proper structure
    return cachedData.map((group, index) => {
      if (!group || !group.group || !Array.isArray(group.recipes)) {
        console.warn('Invalid group structure in cached data, using original');
        return originalRecipes[index] || group;
      }
      
      // Restore missing properties from original recipes
      const originalGroup = originalRecipes[index];
      if (originalGroup) {
        return {
          ...originalGroup, // Keep original icon, color, and other properties
          group: group.group, // Use translated group name
          recipes: group.recipes // Use translated recipes
        };
      }
      
      return group;
    });
  } catch (error) {
    console.error('Error validating cached data:', error);
    return originalRecipes;
  }
};

// Function to cache translation
const cacheTranslation = (cacheKey, data) => {
  try {
    const cacheData = {
      data: data,
      _cachedAt: Date.now(),
      _version: '1.0'
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log('💾 Cached recipe translation:', cacheKey);
  } catch (error) {
    console.warn('Failed to cache translation:', error);
  }
};

// Function to clear expired cache entries
const cleanExpiredCache = () => {
  try {
    const now = Date.now();
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed._cachedAt && (now - parsed._cachedAt) > maxAge) {
              localStorage.removeItem(key);
              cleanedCount++;
            }
          }
        } catch (parseError) {
          localStorage.removeItem(key);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('Failed to clean expired cache:', error);
    return 0;
  }
};

// Function to clear corrupted cache
const clearCorruptedCache = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            JSON.parse(value); // Test if it's valid JSON
          }
        } catch (parseError) {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log(`🧹 Removed ${keysToRemove.length} corrupted cache entries`);
    }
    return keysToRemove.length;
  } catch (error) {
    console.error('Failed to clear corrupted cache:', error);
    return 0;
  }
};

// Clean expired cache on module load
cleanExpiredCache();
clearCorruptedCache();

const groupedRecipes = [
  {
    group: 'Salads',
    icon: Salad,
    color: 'success',
    recipes: [
      {
        id: 1,
        title: 'Quinoa-Chickpea Salad',
        time: '15 min',
        difficulty: 'Easy',
        servings: 2,
        tags: ['Healthy', 'Quick', 'Vegetarian'],
        instructions: [
          'Rinse and drain chickpeas.',
          'Mix quinoa, chickpeas, spinach, cucumber, and tomatoes in a bowl.',
          'Whisk dressing ingredients and toss with salad.'
        ],
        tips: 'Add fresh herbs for extra flavor.',
        image: '/images/recipes/Quinoa-ChickpeaSalad.png',
        ingredients: [
          '1 cup cooked quinoa',
          '½ cup canned chickpeas (drained)',
          'Handful baby spinach, chopped',
          '¼ cup diced cucumber, ¼ cup cherry tomatoes',
          'Dressing: 1 tbsp olive oil, 1 tbsp lemon juice, 1 tsp Dijon mustard, salt/pepper'
        ],
        macros: {
          calories: '420 kcal',
          protein: '15 g',
          fat: '14 g',
          carbs: '55 g'
        }
      },
      {
        id: 2,
        title: 'Greek Feta Salad',
        time: '10 min',
        difficulty: 'Easy',
        servings: 1,
        tags: ['Quick', 'Mediterranean', 'Low-carb'],
        instructions: [
          'Chop all vegetables and place in a bowl.',
          'Add feta and olives.',
          'Drizzle with olive oil, lemon juice, and oregano. Toss gently.'
        ],
        tips: 'Use Kalamata olives for authentic flavor.',
        image: '/images/recipes/Greek FetaSalad.png',
        ingredients: [
          '1 cup chopped romaine',
          '½ cup cherry tomatoes',
          '¼ cup diced cucumber',
          '2 tbsp crumbled feta',
          '5 olives, sliced',
          'Dressing: 1 tbsp olive oil, lemon juice, oregano'
        ],
        macros: {
          calories: '210 kcal',
          protein: '6 g',
          fat: '15 g',
          carbs: '14 g'
        }
      },
      {
        id: 3,
        title: 'Lentil-Apple Salad',
        time: '20 min',
        difficulty: 'Easy',
        servings: 2,
        tags: ['Healthy', 'Fiber-rich', 'Vegan'],
        instructions: [
          'Cook lentils until tender, drain and cool.',
          'Dice apple and celery.',
          'Mix all ingredients and toss with vinaigrette.'
        ],
        tips: 'Great for meal prep!',
        image: '/images/recipes/Lentil-AppleSalad.png',
        ingredients: [
          '1 cup cooked lentils',
          '1 small apple, diced',
          '1 stalk celery, diced',
          '2 tbsp chopped walnuts',
          'Dressing: 1 tbsp olive oil, 1 tsp vinegar, salt/pepper'
        ],
        macros: {
          calories: '320 kcal',
          protein: '13 g',
          fat: '8 g',
          carbs: '48 g'
        }
      }
    ]
  },
  {
    group: 'Warm Dishes',
    icon: Soup,
    color: 'warning',
    recipes: [
      {
        id: 4,
        title: 'Salmon & Veggie Power Bowl',
        time: '30 min',
        difficulty: 'Medium',
        servings: 1,
        tags: ['High-protein', 'Omega-3', 'Balanced'],
        instructions: [
          'Grill salmon until cooked through.',
          'Steam broccoli and roast sweet potato.',
          'Assemble bowl and drizzle with tahini.'
        ],
        tips: 'Swap salmon for tofu for a vegan version.',
        image: '/images/recipes/Salmon&VeggiePowerBowl.png',
        ingredients: [
          '150 g grilled salmon filet',
          '1 cup steamed broccoli',
          '½ cup roasted sweet potato cubes',
          '1 tbsp tahini drizzle'
        ],
        macros: {
          calories: '480 kcal',
          protein: '32 g',
          fat: '24 g',
          carbs: '36 g'
        }
      },
      {
        id: 5,
        title: 'Vegetarian Chili',
        time: '40 min',
        difficulty: 'Medium',
        servings: 4,
        tags: ['Comfort Food', 'High-fiber', 'Make-ahead'],
        instructions: [
          'Sauté bell pepper and corn.',
          'Add beans, tomatoes, and spices.',
          'Simmer for 30 minutes.'
        ],
        tips: 'Serve with brown rice or quinoa.',
        image: '/images/recipes/VegetarianChili.png',
        ingredients: [
          '1 cup cooked beans',
          '½ cup corn',
          '½ cup diced tomatoes',
          '¼ cup bell pepper',
          'Spices: cumin, chili powder, garlic'
        ],
        macros: {
          calories: '320 kcal',
          protein: '13 g',
          fat: '5 g',
          carbs: '60 g'
        }
      },
      {
        id: 6,
        title: 'Sweet Potato & Black Bean Bake',
        time: '35 min',
        difficulty: 'Easy',
        servings: 3,
        tags: ['Comfort Food', 'Vegetarian', 'Meal Prep'],
        instructions: [
          'Layer sliced sweet potato and black beans in a baking dish.',
          'Top with salsa and bake at 200°C for 25 minutes.',
          'Sprinkle with cheese and bake 5 more minutes.'
        ],
        tips: 'Add jalapeños for a spicy kick.',
        image: '/images/recipes/SweetPotato&BlackBeanBake.png',
        ingredients: [
          '1 medium sweet potato, sliced',
          '½ cup black beans',
          '½ cup salsa',
          '¼ cup shredded cheese'
        ],
        macros: {
          calories: '370 kcal',
          protein: '14 g',
          fat: '9 g',
          carbs: '60 g'
        }
      }
    ]
  },
  {
    group: 'Appetizers',
    icon: Sandwich,
    color: 'info',
    recipes: [
      {
        id: 7,
        title: 'Avocado-Egg Toast',
        time: '10 min',
        difficulty: 'Easy',
        servings: 1,
        tags: ['Quick', 'Protein-rich', 'Trendy'],
        instructions: [
          'Toast bread.',
          'Mash avocado and spread on toast.',
          'Top with poached eggs and seasonings.'
        ],
        tips: 'Add microgreens for extra nutrition.',
        image: '/images/recipes/Avocado-EggToast.png',
        ingredients: [
          '2 slices whole-grain sourdough',
          '1 ripe avocado',
          '2 eggs (poached or soft-boiled)',
          'Pinch chili flakes, sea salt, cracked pepper'
        ],
        macros: {
          calories: '350 kcal',
          protein: '14 g',
          fat: '20 g',
          carbs: '30 g'
        }
      },
      {
        id: 8,
        title: 'Eggplant Rolls',
        time: '25 min',
        difficulty: 'Medium',
        servings: 2,
        tags: ['Mediterranean', 'Low-carb', 'Elegant'],
        instructions: [
          'Grill eggplant slices.',
          'Spread ricotta and pesto, roll up.',
          'Season and serve.'
        ],
        tips: 'Serve warm or cold.',
        image: '/images/recipes/EggplantRolls.png',
        ingredients: [
          '2 slices grilled eggplant',
          '2 tbsp ricotta cheese',
          '1 tbsp pesto',
          'Pinch black pepper'
        ],
        macros: {
          calories: '120 kcal',
          protein: '5 g',
          fat: '8 g',
          carbs: '7 g'
        }
      },
      {
        id: 9,
        title: 'Stuffed Mini Peppers',
        time: '20 min',
        difficulty: 'Easy',
        servings: 2,
        tags: ['Colorful', 'Appetizer', 'Party Food'],
        instructions: [
          'Halve and deseed mini peppers.',
          'Mix cottage cheese and herbs, fill peppers.',
          'Bake at 180°C for 10 minutes.'
        ],
        tips: 'Try with goat cheese for a twist.',
        image: '/images/recipes/StuffedMiniPeppers.png',
        ingredients: [
          '4 mini sweet peppers',
          '¼ cup cottage cheese',
          '1 tbsp chopped herbs',
          'Salt, pepper'
        ],
        macros: {
          calories: '110 kcal',
          protein: '8 g',
          fat: '3 g',
          carbs: '14 g'
        }
      }
    ]
  },
  {
    group: 'More',
    icon: ChefHat,
    color: 'primary',
    recipes: [
      {
        id: 10,
        title: 'Protein Pancakes',
        time: '20 min',
        difficulty: 'Easy',
        servings: 2,
        tags: ['High-protein', 'Breakfast', 'Fitness'],
        instructions: [
          'Blend all ingredients until smooth.',
          'Cook pancakes on a nonstick skillet until golden.',
          'Serve with fruit or yogurt.'
        ],
        tips: 'Add cinnamon for extra flavor.',
        image: '/images/recipes/ProteinPancakes.png',
        ingredients: [
          '2 eggs',
          '½ cup rolled oats',
          '½ banana',
          '1 scoop protein powder',
          '1 tsp baking powder'
        ],
        macros: {
          calories: '310 kcal',
          protein: '22 g',
          fat: '8 g',
          carbs: '38 g'
        }
      },
      {
        id: 11,
        title: 'Mini Veggie Frittatas',
        time: '25 min',
        difficulty: 'Easy',
        servings: 6,
        tags: ['Make-ahead', 'Portable', 'Vegetarian'],
        instructions: [
          'Whisk eggs and seasonings.',
          'Add veggies and cheese.',
          'Pour into muffin tin and bake at 180°C for 18-20 min.'
        ],
        tips: 'Great for breakfast on the go.',
        image: '/images/recipes/Mini VeggieFrittatas.png',
        ingredients: [
          '2 eggs',
          '¼ cup diced bell pepper',
          '¼ cup spinach',
          '2 tbsp feta cheese',
          'Salt, pepper'
        ],
        macros: {
          calories: '180 kcal',
          protein: '13 g',
          fat: '11 g',
          carbs: '6 g'
        }
      },
      {
        id: 12,
        title: 'Berry Yogurt Parfait',
        time: '5 min',
        difficulty: 'Easy',
        servings: 1,
        tags: ['Quick', 'Healthy', 'Refreshing'],
        instructions: [
          'Layer yogurt, berries, and granola in a glass.',
          'Repeat layers and serve immediately.'
        ],
        tips: 'Use Greek yogurt for more protein.',
        image: '/images/recipes/BerryYogurtParfait.png',
        ingredients: [
          '1 cup Greek yogurt',
          '½ cup mixed berries',
          '¼ cup granola'
        ],
        macros: {
          calories: '250 kcal',
          protein: '15 g',
          fat: '5 g',
          carbs: '38 g'
        }
      }
    ]
  }
];

const fallbackImage = '/images/logos/logo-placeholder.png';

// Translation function for recipes using backend API
const translateRecipes = async (recipes, targetLang = 'he') => {
  try {
    // Check cache first
    const cacheKey = createRecipeCacheKey(recipes, targetLang);
    const cachedTranslation = getCachedTranslation(cacheKey);
    
    if (cachedTranslation) {
      console.log('📚 Using cached recipe translation for', targetLang);
      // Validate and clean the cached data before returning
      return validateAndCleanCachedData(cachedTranslation, recipes);
    }
    
    console.log('🌐 Fetching fresh recipe translation for', targetLang);
    
    const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipes, targetLang }),
    });

    if (!response.ok) {
      throw new Error('Translation failed');
    }
    
    const result = await response.json();
    const translatedRecipes = result.recipes || recipes;
    
    // Preserve the original group structure with icons and colors
    const finalTranslatedRecipes = translatedRecipes.map((translatedGroup, index) => ({
      ...recipes[index], // Keep original icon, color properties
      group: translatedGroup.group, // Use translated group name
      recipes: translatedGroup.recipes // Use translated recipes
    }));
    
    // Cache the successful translation
    cacheTranslation(cacheKey, finalTranslatedRecipes);
    
    return finalTranslatedRecipes;
  } catch (error) {
    console.error('Error translating recipes:', error);
    
    // Try to use cached translations as fallback if available
    try {
      const fallbackCacheKey = `${CACHE_PREFIX}_${targetLang}_fallback`;
      const fallbackTranslation = getCachedTranslation(fallbackCacheKey);
      if (fallbackTranslation) {
        console.log('🔄 Using fallback cached recipe translation');
        return validateAndCleanCachedData(fallbackTranslation, recipes);
      }
    } catch (fallbackError) {
      console.warn('Failed to load fallback translation:', fallbackError);
    }
    
    return recipes;
  }
};

function RecipeModal({ recipe, onClose, translations }) {
  if (!recipe) return null;

  const handlePrint = () => {
    window.print();
  };

  const colorMap = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-info/10 border-info/30 text-info',
    primary: 'bg-primary/10 border-primary/30 text-primary'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full mx-4 animate-scale-in border border-border/40 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-success/10 to-info/10 px-8 py-6 border-b border-border/30">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-16 h-16 object-cover rounded-xl border-2 border-primary/20 shadow-md"
                  onError={e => { e.target.onerror = null; e.target.src = fallbackImage; }}
                />
                <div>
                  <h2 className="text-2xl font-bold text-gradient-primary font-heading">
                    {recipe.title}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {recipe.time}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {recipe.servings} {translations.serving || 'serving'}{recipe.servings > 1 ? (translations.pluralSuffix || 's') : ''}
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      {recipe.difficulty}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Tags */}
              <div className="flex items-center gap-2 flex-wrap">
                {recipe.tags?.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-8 py-6 flex-1 space-y-6">
          
          {/* Macros */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20 text-center">
              <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.calories || 'Calories'}</p>
              <p className="text-lg font-bold text-primary mt-1">{recipe.macros.calories}</p>
            </div>
            <div className="bg-gradient-to-br from-success/5 to-success/10 rounded-xl p-4 border border-success/20 text-center">
              <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.protein || 'Protein'}</p>
              <p className="text-lg font-bold text-success mt-1">{recipe.macros.protein}</p>
            </div>
            <div className="bg-gradient-to-br from-warning/5 to-warning/10 rounded-xl p-4 border border-warning/20 text-center">
              <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.fat || 'Fat'}</p>
              <p className="text-lg font-bold text-warning mt-1">{recipe.macros.fat}</p>
            </div>
            <div className="bg-gradient-to-br from-info/5 to-info/10 rounded-xl p-4 border border-info/20 text-center">
              <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.carbs || 'Carbs'}</p>
              <p className="text-lg font-bold text-info mt-1">{recipe.macros.carbs}</p>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-success to-success-lighter flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              {translations.ingredients || 'Ingredients'}
            </h3>
            <div className="bg-muted/30 rounded-xl p-4 border border-border/40">
              <ul className="space-y-2">
                {recipe.ingredients.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary-lighter flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              {translations.howToMakeIt || 'Instructions'}
            </h3>
            <div className="space-y-3">
              {recipe.instructions.map((step, idx) => (
                <div key={idx} className="flex gap-4 p-4 bg-muted/20 rounded-xl border border-border/30">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-primary to-primary-lighter rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {idx + 1}
                  </div>
                  <p className="text-sm leading-relaxed pt-1">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {recipe.tips && (
            <div className="bg-gradient-to-r from-warning/10 to-warning/5 rounded-xl p-4 border border-warning/30">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-warning to-warning-lighter flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Star className="w-3 h-3 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-warning mb-1">{translations.tip || 'Pro Tip'}</h4>
                  <p className="text-sm text-foreground/80">{recipe.tips}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-muted/30 px-8 py-4 border-t border-border/30">
          <Button
            onClick={handlePrint}
            variant="outline"
            className="w-full"
          >
            <Printer className="w-4 h-4 mr-2" />
            {translations.printRecipe || 'Print Recipe'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecipeCard({ recipe, group, onClick }) {
  const { translations } = useLanguage();
  const colorMap = {
    success: 'from-success/5 to-success/10 border-success/30',
    warning: 'from-warning/5 to-warning/10 border-warning/30',
    info: 'from-info/5 to-info/10 border-info/30',
    primary: 'from-primary/5 to-primary/10 border-primary/30'
  };

  return (
    <Card 
      className={`cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 interactive group shadow-premium hover:shadow-glow-${group.color}`}
      onClick={() => onClick(recipe)}
    >
      <div className="relative overflow-hidden">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110"
          onError={e => { e.target.onerror = null; e.target.src = fallbackImage; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="absolute top-3 left-3">
          <Badge className={`bg-gradient-to-r ${colorMap[group.color]} border`}>
            <Clock className="w-3 h-3 mr-1" />
            {recipe.time}
          </Badge>
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
            <Users className="w-3 h-3 mr-1" />
            {recipe.servings}
          </Badge>
        </div>
      </div>
      
      <CardContent className="p-5">
        <h3 className="text-lg font-bold text-foreground mb-2 font-heading group-hover:text-primary transition-colors duration-300">
          {recipe.title}
        </h3>
        
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs">
            {recipe.difficulty}
          </Badge>
          {recipe.tags?.slice(0, 2).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

                  <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
            <div className="text-center">
              <p className="font-semibold text-primary">{recipe.macros.calories.split(' ')[0]}</p>
              <p>{translations.calories || 'kcal'}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-success">{recipe.macros.protein}</p>
              <p>{translations.protein || 'protein'}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-warning">{recipe.macros.fat}</p>
              <p>{translations.fat || 'fat'}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-info">{recipe.macros.carbs}</p>
              <p>{translations.carbs || 'carbs'}</p>
            </div>
          </div>
      </CardContent>
    </Card>
  );
}

export default function RecipesPage() {
  const { language, translations } = useLanguage();
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [translatedRecipes, setTranslatedRecipes] = useState(groupedRecipes);
  const [isTranslating, setIsTranslating] = useState(false);

  const getTranslatedGroupName = (groupName) => {
    const groupTranslations = {
      'Salads': translations.salads || 'Salads',
      'Warm Dishes': translations.warmDishes || 'Warm Dishes',
      'Appetizers': translations.appetizers || 'Appetizers',
      'More': translations.more || 'More'
    };
    return groupTranslations[groupName] || groupName;
  };

  useEffect(() => {
    const handleTranslation = async () => {
      if (language === 'he') {
        setIsTranslating(true);
        try {
          const cacheKey = createRecipeCacheKey(groupedRecipes, 'he');
          const cached = getCachedTranslation(cacheKey);

          if (cached) {
            try {
              const validatedCached = validateAndCleanCachedData(cached, groupedRecipes);
              setTranslatedRecipes(validatedCached);
              console.log('✅ Loaded cached recipe translations for Hebrew.');
            } catch (validationError) {
              console.warn('Cached data validation failed, clearing cache and fetching fresh translation');
              localStorage.removeItem(cacheKey);
              clearCorruptedCache();
              const translated = await translateRecipes(groupedRecipes, 'he');
              setTranslatedRecipes(translated);
              cacheTranslation(cacheKey, translated);
            }
          } else {
            const translated = await translateRecipes(groupedRecipes, 'he');
            setTranslatedRecipes(translated);
            cacheTranslation(cacheKey, translated);
            console.log('✅ Translated and cached recipe translations for Hebrew.');
          }
        } catch (error) {
          console.error('Translation failed:', error);
          // Clear any corrupted cache and fall back to original recipes
          clearCorruptedCache();
          setTranslatedRecipes(groupedRecipes);
        } finally {
          setIsTranslating(false);
        }
      } else {
        setTranslatedRecipes(groupedRecipes);
      }
    };

    handleTranslation();
  }, [language]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 bg-mesh">
      
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20"></div>
        <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-primary/20 to-success/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-gradient-to-br from-warning/20 to-info/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 container mx-auto px-6 text-center">
          <div className="flex items-center justify-center mb-6 animate-float-gentle">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-lighter rounded-2xl flex items-center justify-center shadow-glow-primary">
              <Utensils className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gradient-primary font-heading mb-4 animate-slide-up">
            {translations.healthyDeliciousRecipes || 'Healthy & Delicious Recipes'}
          </h1>
          
          <p className="text-xl text-muted-foreground/80 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {translations.professionalRecipesDescription || 'Professional nutrition recipes curated by experts for optimal health and taste'}
          </p>
          
          <div className="flex items-center justify-center gap-6 mt-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/30 rounded-xl">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              <span className="text-sm font-medium text-success">{translations.recipesCount || '120+ Recipes'}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-xl">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span className="text-sm font-medium text-primary">{translations.expertApproved || 'Expert Approved'}</span>
            </div>
          </div>
          
        </div>
      </section>

      {/* Recipes Content */}
      <section className="container mx-auto px-6 pb-20">
        {isTranslating && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-sm rounded-xl border border-border/40">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm font-medium text-foreground">{translations.translatingRecipes || 'Translating recipes...'}</span>
            </div>
          </div>
        )}

        <div className="space-y-16">
          {Array.isArray(translatedRecipes) && translatedRecipes.length > 0 ? (
            translatedRecipes.map((group) => {
              // Safety check for group structure
              if (!group || !group.group || !Array.isArray(group.recipes)) {
                console.warn('Invalid group structure:', group);
                return null;
              }
              
              return (
                <div key={group.group} className="animate-slide-up">
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-${group.color || 'primary'} to-${group.color || 'primary'}-lighter flex items-center justify-center text-white shadow-glow-${group.color || 'primary'}`}>
                      {React.isValidElement(group.icon) ? group.icon : 
                       typeof group.icon === 'function' ? React.createElement(group.icon, { className: 'w-6 h-6' }) : 
                       <ChefHat className="w-6 h-6" />}
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-gradient-primary font-heading">
                        {getTranslatedGroupName(group.group)}
                      </h2>
                      <p className="text-muted-foreground/70">
                        {group.recipes.length} {translations.professionalRecipe || 'professional recipe'}{group.recipes.length !== 1 ? (translations.pluralSuffix || 's') : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {group.recipes.map((recipe) => {
                      // Safety check for recipe structure
                      if (!recipe || !recipe.id) {
                        console.warn('Invalid recipe structure:', recipe);
                        return null;
                      }
                      
                      return (
                        <RecipeCard
                          key={recipe.id}
                          recipe={recipe}
                          group={group}
                          onClick={setSelectedRecipe}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No recipes available</p>
            </div>
          )}
        </div>
      </section>

      {/* Recipe Modal */}
      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          translations={translations}
        />
      )}
    </div>
  );
} 