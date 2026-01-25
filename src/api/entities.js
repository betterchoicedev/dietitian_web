import { entities, auth } from './client';

export const Menu = entities.Menu;
export const Chat = entities.Chat;
export const Client = entities.Client;
export const ChatUser = entities.ChatUser;
export const ChatMessage = entities.ChatMessage;
export const ChatConversation = entities.ChatConversation;
export const MessageQueue = entities.MessageQueue;
export const WeightLogs = entities.WeightLogs;
export const FoodLogs = entities.FoodLogs;
export const TrainingPlans = entities.TrainingPlans;
export const TrainingLogs = entities.TrainingLogs;
export const TrainingReminders = entities.TrainingReminders;
export const ExerciseLibrary = entities.ExerciseLibrary;
export const TrainingPlanTemplates = entities.TrainingPlanTemplates;
export const Profiles = entities.Profiles;
export const Companies = entities.Companies;
export const RegistrationInvites = entities.RegistrationInvites;
export const ScheduledReminders = entities.ScheduledReminders;
export const SystemMessages = entities.SystemMessages;
export const UserMessagePreferences = entities.UserMessagePreferences;
export const Ingredients = entities.Ingredients;
export const MealTemplates = entities.MealTemplates;
export const MealTemplateVariants = entities.MealTemplateVariants;
export const MealTemplateMeals = entities.MealTemplateMeals;
export const ClientMealPlans = entities.ClientMealPlans;
export const Clients = entities.Clients;

// auth sdk:
export const User = auth;