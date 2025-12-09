// Export all stores
export { useJournalStore } from "./journal-store";
export { useVitalsStore } from "./vitals-store";
export { useCapitalStore } from "./capital-store";
export { useCapitalDataStore } from "./capital-data-store";
export { useDocumentStore } from "./document-store";
export { useAiStore } from "./ai-store";
export { useWorkoutStore } from "./workout-store";
export { useMetaStore } from "./meta-store";
export { useUIStore } from "./ui-store";
export { usePreferencesStore } from "./preferences-store";
export { useProjectStore } from "./project-store";

// Export types
export type {
  JournalEntry,
  CreateJournalEntry,
  UpdateJournalEntry,
} from "./journal-store";

export type {
  DailyVitals,
  DailyReadinessData,
  DailyActivityData,
  DailySleepData,
  DailyStressData,
  DailySpO2Data,
  DailyCardiovascularAgeData,
  DailyResilienceData,
  VO2MaxData,
} from "./vitals-store";

export type {
  ExerciseType,
  ExerciseEntry,
  ExerciseTypeInput,
  ExerciseEntryInput,
} from "./workout-store";

export type {
  PersonRegistry,
  Person,
  PlaceRegistry,
  Place,
  TagTaxonomy,
  Tag,
  KeywordingBestPractices,
  CapitalReadme,
  AddPersonRequest,
  UpdatePersonRequest,
  AddPlaceRequest,
  UpdatePlaceRequest,
  AddTagRequest,
  UpdateTagRequest,
} from "./meta-store";

export type { Notification, NotificationAction } from "./ui-store";

export type { AiPrompt } from "./ai-store";

export type {
  DocumentInfo,
  ImportRequest,
  ImportResponse,
  ListDocumentsQuery,
  ListDocumentsResponse,
  FlatTransaction,
  BatchImportResponse,
} from "./document-store";

// Export helper functions
export { getLast7Days } from "./vitals-store";
