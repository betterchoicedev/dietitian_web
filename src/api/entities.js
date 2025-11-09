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

// auth sdk:
export const User = auth;