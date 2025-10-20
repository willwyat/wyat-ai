import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

// Types for meta data
export interface PersonRegistry {
  title: string;
  version: string;
  persons: Person[];
}

export interface Person {
  tag: string;
  name: string;
  nicknames: string[];
  visibility: string;
}

export interface PlaceRegistry {
  title: string;
  version: string;
  places: Place[];
}

export interface Place {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
}

export interface TagTaxonomy {
  title: string;
  version: string;
  tags: Tag[];
}

export interface Tag {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
}

export interface KeywordingBestPractices {
  title: string;
  version: string;
  content: string;
}

export interface CapitalReadme {
  title: string;
  version: string;
  content: string;
}

// Request types
export interface AddPersonRequest {
  tag: string;
  name: string;
  nicknames: string[];
  visibility: string;
}

export interface UpdatePersonRequest {
  tag?: string;
  name?: string;
  nicknames?: string[];
  visibility?: string;
}

export interface AddPlaceRequest {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
}

export interface UpdatePlaceRequest {
  tag?: string;
  name?: string;
  aliases?: string[];
  notes?: string;
  visibility?: string;
}

export interface AddTagRequest {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
}

export interface UpdateTagRequest {
  tag?: string;
  name?: string;
  aliases?: string[];
  notes?: string;
  visibility?: string;
}

interface MetaState {
  // Data
  personRegistry: PersonRegistry | null;
  placeRegistry: PlaceRegistry | null;
  tagTaxonomy: TagTaxonomy | null;
  keywordingBestPractices: KeywordingBestPractices | null;
  capitalReadme: CapitalReadme | null;

  // UI State
  loading: boolean;
  error: string | null;
  saving: boolean;

  // Person Registry State
  isEditingPersonRegistry: boolean;
  editPersonTitle: string;
  editPersonVersion: string;
  showAddPersonForm: boolean;
  editingPerson: string | null;
  newPerson: AddPersonRequest;
  newNickname: string;
  editPerson: UpdatePersonRequest;

  // Place Registry State
  isEditingPlaceRegistry: boolean;
  editPlaceTitle: string;
  editPlaceVersion: string;
  showAddPlaceForm: boolean;
  editingPlace: string | null;
  newPlace: AddPlaceRequest;
  newAlias: string;
  editPlace: UpdatePlaceRequest;

  // Tag Taxonomy State
  isEditingTagTaxonomy: boolean;
  editTagTitle: string;
  editTagVersion: string;
  showAddTagForm: boolean;
  editingTag: string | null;
  newTag: AddTagRequest;
  newTagAlias: string;
  editTag: UpdateTagRequest;

  // Actions - Data Fetching
  fetchPersonRegistry: () => Promise<void>;
  fetchPlaceRegistry: () => Promise<void>;
  fetchTagTaxonomy: () => Promise<void>;
  fetchKeywordingBestPractices: () => Promise<void>;
  fetchCapitalReadme: () => Promise<void>;

  // Actions - Person Registry
  savePersonRegistry: () => Promise<boolean>;
  addPerson: () => Promise<boolean>;
  updatePerson: (tag: string) => Promise<boolean>;
  deletePerson: (tag: string) => Promise<boolean>;

  // Actions - Place Registry
  savePlaceRegistry: () => Promise<boolean>;
  addPlace: () => Promise<boolean>;
  updatePlace: (tag: string) => Promise<boolean>;
  deletePlace: (tag: string) => Promise<boolean>;

  // Actions - Tag Taxonomy
  saveTagTaxonomy: () => Promise<boolean>;
  addTag: () => Promise<boolean>;
  updateTag: (tag: string) => Promise<boolean>;
  deleteTag: (tag: string) => Promise<boolean>;

  // Actions - UI
  setIsEditingPersonRegistry: (editing: boolean) => void;
  setEditPersonTitle: (title: string) => void;
  setEditPersonVersion: (version: string) => void;
  setShowAddPersonForm: (show: boolean) => void;
  setEditingPerson: (tag: string | null) => void;
  setNewPerson: (person: Partial<AddPersonRequest>) => void;
  setNewNickname: (nickname: string) => void;
  setEditPerson: (person: Partial<UpdatePersonRequest>) => void;

  setIsEditingPlaceRegistry: (editing: boolean) => void;
  setEditPlaceTitle: (title: string) => void;
  setEditPlaceVersion: (version: string) => void;
  setShowAddPlaceForm: (show: boolean) => void;
  setEditingPlace: (tag: string | null) => void;
  setNewPlace: (place: Partial<AddPlaceRequest>) => void;
  setNewAlias: (alias: string) => void;
  setEditPlace: (place: Partial<UpdatePlaceRequest>) => void;

  setIsEditingTagTaxonomy: (editing: boolean) => void;
  setEditTagTitle: (title: string) => void;
  setEditTagVersion: (version: string) => void;
  setShowAddTagForm: (show: boolean) => void;
  setEditingTag: (tag: string | null) => void;
  setNewTag: (tag: Partial<AddTagRequest>) => void;
  setNewTagAlias: (alias: string) => void;
  setEditTag: (tag: Partial<UpdateTagRequest>) => void;

  clearError: () => void;
}

const initialNewPerson: AddPersonRequest = {
  tag: "",
  name: "",
  nicknames: [],
  visibility: "public",
};

const initialEditPerson: UpdatePersonRequest = {
  tag: "",
  name: "",
  nicknames: [],
  visibility: "public",
};

const initialNewPlace: AddPlaceRequest = {
  tag: "",
  name: "",
  aliases: [],
  notes: "",
  visibility: "public",
};

const initialEditPlace: UpdatePlaceRequest = {
  tag: "",
  name: "",
  aliases: [],
  notes: "",
  visibility: "public",
};

const initialNewTag: AddTagRequest = {
  tag: "",
  name: "",
  aliases: [],
  notes: "",
  visibility: "public",
};

const initialEditTag: UpdateTagRequest = {
  tag: "",
  name: "",
  aliases: [],
  notes: "",
  visibility: "public",
};

export const useMetaStore = create<MetaState>()(
  devtools(
    (set, get) => ({
      // Initial State
      personRegistry: null,
      placeRegistry: null,
      tagTaxonomy: null,
      keywordingBestPractices: null,
      capitalReadme: null,
      loading: false,
      error: null,
      saving: false,

      // Person Registry State
      isEditingPersonRegistry: false,
      editPersonTitle: "",
      editPersonVersion: "",
      showAddPersonForm: false,
      editingPerson: null,
      newPerson: initialNewPerson,
      newNickname: "",
      editPerson: initialEditPerson,

      // Place Registry State
      isEditingPlaceRegistry: false,
      editPlaceTitle: "",
      editPlaceVersion: "",
      showAddPlaceForm: false,
      editingPlace: null,
      newPlace: initialNewPlace,
      newAlias: "",
      editPlace: initialEditPlace,

      // Tag Taxonomy State
      isEditingTagTaxonomy: false,
      editTagTitle: "",
      editTagVersion: "",
      showAddTagForm: false,
      editingTag: null,
      newTag: initialNewTag,
      newTagAlias: "",
      editTag: initialEditTag,

      // Data Fetching Actions
      fetchPersonRegistry: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/person-registry`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({
            personRegistry: data,
            editPersonTitle: data.title,
            editPersonVersion: data.version,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchPlaceRegistry: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/place-registry`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({
            placeRegistry: data,
            editPlaceTitle: data.title,
            editPlaceVersion: data.version,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchTagTaxonomy: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/tag-taxonomy`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({
            tagTaxonomy: data,
            editTagTitle: data.title,
            editTagVersion: data.version,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchKeywordingBestPractices: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/keywording-best-practices`,
            {
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ keywordingBestPractices: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchCapitalReadme: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/capital-readme`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ capitalReadme: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      // Person Registry Actions
      savePersonRegistry: async () => {
        const { personRegistry, editPersonTitle, editPersonVersion } = get();
        if (!personRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/person-registry`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify({
              ...personRegistry,
              title: editPersonTitle,
              version: editPersonVersion,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set({ saving: false });
          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      addPerson: async () => {
        const { newPerson, personRegistry } = get();
        if (!personRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/person-registry/persons`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(newPerson),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedPerson = await response.json();
          set((state) => ({
            personRegistry: state.personRegistry
              ? {
                  ...state.personRegistry,
                  persons: [...state.personRegistry.persons, updatedPerson],
                }
              : null,
            newPerson: initialNewPerson,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      updatePerson: async (tag: string) => {
        const { editPerson, personRegistry } = get();
        if (!personRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/person-registry/persons/${tag}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(editPerson),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedPerson = await response.json();
          set((state) => ({
            personRegistry: state.personRegistry
              ? {
                  ...state.personRegistry,
                  persons: state.personRegistry.persons.map((p) =>
                    p.tag === tag ? updatedPerson : p
                  ),
                }
              : null,
            editPerson: initialEditPerson,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      deletePerson: async (tag: string) => {
        const { personRegistry } = get();
        if (!personRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/person-registry/persons/${tag}`,
            {
              method: "DELETE",
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set((state) => ({
            personRegistry: state.personRegistry
              ? {
                  ...state.personRegistry,
                  persons: state.personRegistry.persons.filter(
                    (p) => p.tag !== tag
                  ),
                }
              : null,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      // Place Registry Actions (similar pattern to person registry)
      savePlaceRegistry: async () => {
        const { placeRegistry, editPlaceTitle, editPlaceVersion } = get();
        if (!placeRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/place-registry`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify({
              ...placeRegistry,
              title: editPlaceTitle,
              version: editPlaceVersion,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set({ saving: false });
          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      addPlace: async () => {
        const { newPlace, placeRegistry } = get();
        if (!placeRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/place-registry/places`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(newPlace),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedPlace = await response.json();
          set((state) => ({
            placeRegistry: state.placeRegistry
              ? {
                  ...state.placeRegistry,
                  places: [...state.placeRegistry.places, updatedPlace],
                }
              : null,
            newPlace: initialNewPlace,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      updatePlace: async (tag: string) => {
        const { editPlace, placeRegistry } = get();
        if (!placeRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/place-registry/places/${tag}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(editPlace),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedPlace = await response.json();
          set((state) => ({
            placeRegistry: state.placeRegistry
              ? {
                  ...state.placeRegistry,
                  places: state.placeRegistry.places.map((p) =>
                    p.tag === tag ? updatedPlace : p
                  ),
                }
              : null,
            editPlace: initialEditPlace,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      deletePlace: async (tag: string) => {
        const { placeRegistry } = get();
        if (!placeRegistry) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/place-registry/places/${tag}`,
            {
              method: "DELETE",
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set((state) => ({
            placeRegistry: state.placeRegistry
              ? {
                  ...state.placeRegistry,
                  places: state.placeRegistry.places.filter(
                    (p) => p.tag !== tag
                  ),
                }
              : null,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      // Tag Taxonomy Actions (similar pattern)
      saveTagTaxonomy: async () => {
        const { tagTaxonomy, editTagTitle, editTagVersion } = get();
        if (!tagTaxonomy) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/tag-taxonomy`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify({
              ...tagTaxonomy,
              title: editTagTitle,
              version: editTagVersion,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set({ saving: false });
          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      addTag: async () => {
        const { newTag, tagTaxonomy } = get();
        if (!tagTaxonomy) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(`${API_URL}/meta/tag-taxonomy/tags`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify(newTag),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedTag = await response.json();
          set((state) => ({
            tagTaxonomy: state.tagTaxonomy
              ? {
                  ...state.tagTaxonomy,
                  tags: [...state.tagTaxonomy.tags, updatedTag],
                }
              : null,
            newTag: initialNewTag,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      updateTag: async (tag: string) => {
        const { editTag, tagTaxonomy } = get();
        if (!tagTaxonomy) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/tag-taxonomy/tags/${tag}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(editTag),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedTag = await response.json();
          set((state) => ({
            tagTaxonomy: state.tagTaxonomy
              ? {
                  ...state.tagTaxonomy,
                  tags: state.tagTaxonomy.tags.map((t) =>
                    t.tag === tag ? updatedTag : t
                  ),
                }
              : null,
            editTag: initialEditTag,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      deleteTag: async (tag: string) => {
        const { tagTaxonomy } = get();
        if (!tagTaxonomy) return false;

        set({ saving: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/meta/tag-taxonomy/tags/${tag}`,
            {
              method: "DELETE",
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set((state) => ({
            tagTaxonomy: state.tagTaxonomy
              ? {
                  ...state.tagTaxonomy,
                  tags: state.tagTaxonomy.tags.filter((t) => t.tag !== tag),
                }
              : null,
            saving: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            saving: false,
          });
          return false;
        }
      },

      // UI Actions
      setIsEditingPersonRegistry: (editing) => {
        set({ isEditingPersonRegistry: editing });
      },

      setEditPersonTitle: (title) => {
        set({ editPersonTitle: title });
      },

      setEditPersonVersion: (version) => {
        set({ editPersonVersion: version });
      },

      setShowAddPersonForm: (show) => {
        set({ showAddPersonForm: show });
      },

      setEditingPerson: (tag) => {
        set({ editingPerson: tag });
      },

      setNewPerson: (person) => {
        set((state) => ({
          newPerson: { ...state.newPerson, ...person },
        }));
      },

      setNewNickname: (nickname) => {
        set({ newNickname: nickname });
      },

      setEditPerson: (person) => {
        set((state) => ({
          editPerson: { ...state.editPerson, ...person },
        }));
      },

      // Place UI Actions
      setIsEditingPlaceRegistry: (editing) => {
        set({ isEditingPlaceRegistry: editing });
      },

      setEditPlaceTitle: (title) => {
        set({ editPlaceTitle: title });
      },

      setEditPlaceVersion: (version) => {
        set({ editPlaceVersion: version });
      },

      setShowAddPlaceForm: (show) => {
        set({ showAddPlaceForm: show });
      },

      setEditingPlace: (tag) => {
        set({ editingPlace: tag });
      },

      setNewPlace: (place) => {
        set((state) => ({
          newPlace: { ...state.newPlace, ...place },
        }));
      },

      setNewAlias: (alias) => {
        set({ newAlias: alias });
      },

      setEditPlace: (place) => {
        set((state) => ({
          editPlace: { ...state.editPlace, ...place },
        }));
      },

      // Tag UI Actions
      setIsEditingTagTaxonomy: (editing) => {
        set({ isEditingTagTaxonomy: editing });
      },

      setEditTagTitle: (title) => {
        set({ editTagTitle: title });
      },

      setEditTagVersion: (version) => {
        set({ editTagVersion: version });
      },

      setShowAddTagForm: (show) => {
        set({ showAddTagForm: show });
      },

      setEditingTag: (tag) => {
        set({ editingTag: tag });
      },

      setNewTag: (tag) => {
        set((state) => ({
          newTag: { ...state.newTag, ...tag },
        }));
      },

      setNewTagAlias: (alias) => {
        set({ newTagAlias: alias });
      },

      setEditTag: (tag) => {
        set((state) => ({
          editTag: { ...state.editTag, ...tag },
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "meta-store",
    }
  )
);
