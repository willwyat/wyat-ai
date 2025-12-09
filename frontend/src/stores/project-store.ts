import { create } from "zustand";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import type {
  Project,
  ProjectPlanning,
  ProjectWithPlanning,
} from "@/types/projects";

interface ProjectStore {
  // State
  projects: Project[];
  planningDocuments: ProjectPlanning[];
  projectsWithPlanning: ProjectWithPlanning[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchProjectById: (id: string) => Promise<Project | null>;
  fetchPlanning: () => Promise<void>;
  fetchPlanningById: (id: string) => Promise<ProjectPlanning | null>;
  fetchProjectsWithPlanning: () => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  projects: [],
  planningDocuments: [],
  projectsWithPlanning: [],
  loading: false,
  error: null,

  // Fetch all projects
  fetchProjects: async () => {
    console.log("=== fetchProjects START ===");
    console.log("API_URL:", API_URL);
    console.log(
      "WYAT_API_KEY:",
      WYAT_API_KEY ? `${WYAT_API_KEY.substring(0, 10)}...` : "NOT SET"
    );

    set({ loading: true, error: null });
    try {
      const url = `${API_URL}/projects`;
      console.log("Fetching from:", url);

      const response = await fetch(url, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
        credentials: "include",
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response body:", errorText);
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Projects fetched:", data.length, "projects");
      console.log("Projects data:", data);

      set({ projects: data, loading: false });
      console.log("=== fetchProjects SUCCESS ===");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("=== fetchProjects ERROR ===");
      console.error("Error message:", message);
      console.error("Error details:", error);
      set({ error: message, loading: false });
    }
  },

  // Fetch a single project by ID or slug
  fetchProjectById: async (id: string) => {
    console.log("=== fetchProjectById START ===");
    console.log("Project ID/Slug:", id);

    set({ loading: true, error: null });
    try {
      const url = `${API_URL}/projects/${id}`;
      console.log("Fetching from:", url);

      const response = await fetch(url, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
        credentials: "include",
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn("Project not found:", id);
          set({ error: "Project not found", loading: false });
          return null;
        }
        const errorText = await response.text();
        console.error("Error response body:", errorText);
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Project fetched:", data);
      set({ loading: false });
      console.log("=== fetchProjectById SUCCESS ===");
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("=== fetchProjectById ERROR ===");
      console.error("Error message:", message);
      console.error("Error details:", error);
      set({ error: message, loading: false });
      return null;
    }
  },

  // Fetch all planning documents
  fetchPlanning: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/project-planning`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch planning documents: ${response.statusText}`
        );
      }

      const data = await response.json();
      set({ planningDocuments: data, loading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      set({ error: message, loading: false });
      console.error("Error fetching planning documents:", error);
    }
  },

  // Fetch a single planning document by ID or slug
  fetchPlanningById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/project-planning/${id}`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 404) {
          set({ error: "Planning document not found", loading: false });
          return null;
        }
        throw new Error(
          `Failed to fetch planning document: ${response.statusText}`
        );
      }

      const data = await response.json();
      set({ loading: false });
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      set({ error: message, loading: false });
      console.error("Error fetching planning document:", error);
      return null;
    }
  },

  // Fetch all projects with their planning documents
  fetchProjectsWithPlanning: async () => {
    console.log("=== fetchProjectsWithPlanning START ===");
    console.log("API_URL:", API_URL);

    set({ loading: true, error: null });
    try {
      const url = `${API_URL}/projects/with-planning`;
      console.log("Fetching from:", url);

      const response = await fetch(url, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
        credentials: "include",
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response body:", errorText);
        throw new Error(
          `Failed to fetch projects with planning: ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("Projects with planning fetched:", data.length, "items");
      console.log("Projects with planning data:", data);

      set({ projectsWithPlanning: data, loading: false });
      console.log("=== fetchProjectsWithPlanning SUCCESS ===");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("=== fetchProjectsWithPlanning ERROR ===");
      console.error("Error message:", message);
      console.error("Error details:", error);
      set({ error: message, loading: false });
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
