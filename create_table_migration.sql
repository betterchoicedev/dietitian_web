-- Create the unified meal_plans_and_schemas table
CREATE TABLE meal_plans_and_schemas (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  -- Discriminator: 'schema' for reusable meal plan schemas, 'meal_plan' for client-specific plans
  record_type TEXT NOT NULL, -- 'schema' or 'meal_plan'

  -- The dietitian who created/owns this record
  dietitian_id UUID REFERENCES auth.users(id),

  -- The client this meal plan is for (NULL if record_type is 'schema')
  -- Using user_code to reference chat_users table
  user_code TEXT REFERENCES public.chat_users(user_code),

  -- The name of the meal plan (for both schemas and client meal plans)
  meal_plan_name TEXT NOT NULL,

  -- The reusable schema JSON (structure/blueprint)
  schema JSONB,

  -- The actual meal plan JSON (personalized plan, meals, etc.)
  meal_plan JSONB,

  -- For client meal plans: status, dates, targets, recommendations, restrictions
  status TEXT DEFAULT 'draft',
  active_from TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  daily_total_calories INT,
  macros_target JSONB,
  recommendations JSONB,
  dietary_restrictions JSONB,

  -- Embedded change log: array of JSON objects
  change_log JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_record_type ON public.meal_plans_and_schemas(record_type);
CREATE INDEX idx_user_code ON public.meal_plans_and_schemas(user_code);
CREATE INDEX idx_dietitian_id ON public.meal_plans_and_schemas(dietitian_id);

-- Disable Row Level Security for now (can be enabled later if needed)
-- ALTER TABLE public.meal_plans_and_schemas ENABLE ROW LEVEL SECURITY;

-- Trigger to auto-update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_meal_plans_and_schemas_updated
  BEFORE UPDATE ON public.meal_plans_and_schemas
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

-- Add constraint to ensure proper record types
ALTER TABLE public.meal_plans_and_schemas 
ADD CONSTRAINT check_record_type 
CHECK (record_type IN ('schema', 'meal_plan'));

-- Add constraint to ensure schema records don't have user_code
ALTER TABLE public.meal_plans_and_schemas 
ADD CONSTRAINT check_schema_no_user_code 
CHECK (
  (record_type = 'schema' AND user_code IS NULL) OR 
  (record_type = 'meal_plan')
);

-- Optional: Add foreign key constraint if you have chat_users table
-- ALTER TABLE public.meal_plans_and_schemas 
-- ADD CONSTRAINT fk_user_code 
-- FOREIGN KEY (user_code) REFERENCES public.chat_users(user_code);