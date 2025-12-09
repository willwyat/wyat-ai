export interface Milestone {
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_date?: string;
  completed_date?: string;
  description?: string;
}

export interface Artifact {
  name: string;
  artifact_type: string; // "document", "link", "file", etc.
  url?: string;
  description?: string;
  created_at?: string;
}

export interface Project {
  _id: string;
  slug: string;
  type: string;
  title: string;
  status: "active" | "paused" | "completed" | "archived";
  priority?: "high" | "medium" | "low";
  milestones: Milestone[];
  artifacts: Artifact[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPlanning {
  _id: string;
  slug: string;
  title: string;
  projects: string[]; // Array of project slugs
  version: string;
  content: string; // Markdown content
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithPlanning {
  project: Project;
  planning_documents: ProjectPlanning[];
}
