"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type Place = {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
};

type PlaceRegistry = {
  _id: string;
  type: string;
  title: string;
  version: string;
  places: Place[];
  createdAt: string;
  updatedAt: string;
};

type AddPlaceRequest = {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
};

type UpdatePlaceRequest = {
  tag: string;
  name?: string;
  aliases?: string[];
  notes?: string;
  visibility?: string;
};

export default function PlacesPage() {
  const [data, setData] = useState<PlaceRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingRegistry, setIsEditingRegistry] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add place form state
  const [newPlace, setNewPlace] = useState<AddPlaceRequest>({
    tag: "",
    name: "",
    aliases: [],
    notes: "",
    visibility: "public",
  });
  const [newAlias, setNewAlias] = useState("");

  // Edit place form state
  const [editPlace, setEditPlace] = useState<UpdatePlaceRequest>({
    tag: "",
    name: "",
    aliases: [],
    notes: "",
    visibility: "public",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/meta/place-registry`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setData(data);
      setEditTitle(data.title);
      setEditVersion(data.version);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleSaveRegistry = async () => {
    if (!data) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/place-registry`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify({
          title: editTitle,
          version: editVersion,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      setData({
        ...data,
        title: editTitle,
        version: editVersion,
        updatedAt: new Date().toISOString(),
      });

      setIsEditingRegistry(false);
      alert("Registry updated successfully!");
    } catch (err) {
      alert(
        `Error updating: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlace = async () => {
    if (!newPlace.tag || !newPlace.name) {
      alert("Tag and name are required!");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/places`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(newPlace),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Failed to add: ${response.status}`
        );
      }

      await fetchData(); // Refresh data
      setShowAddForm(false);
      setNewPlace({
        tag: "",
        name: "",
        aliases: [],
        notes: "",
        visibility: "public",
      });
      setNewAlias("");
      alert("Place added successfully!");
    } catch (err) {
      alert(
        `Error adding place: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlace = async () => {
    if (!editPlace.tag) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/places`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(editPlace),
      });

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      await fetchData(); // Refresh data
      setEditingPlace(null);
      setEditPlace({
        tag: "",
        name: "",
        aliases: [],
        notes: "",
        visibility: "public",
      });
      alert("Place updated successfully!");
    } catch (err) {
      alert(
        `Error updating place: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlace = async (tag: string) => {
    if (!confirm(`Are you sure you want to delete place with tag "${tag}"?`))
      return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/places/${tag}`, {
        method: "DELETE",
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      await fetchData(); // Refresh data
      alert("Place deleted successfully!");
    } catch (err) {
      alert(
        `Error deleting place: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const startEditPlace = (place: Place) => {
    setEditingPlace(place.tag);
    setEditPlace({
      tag: place.tag,
      name: place.name,
      aliases: [...place.aliases],
      notes: place.notes,
      visibility: place.visibility,
    });
  };

  const addAlias = () => {
    if (newAlias.trim() && !newPlace.aliases.includes(newAlias.trim())) {
      setNewPlace({
        ...newPlace,
        aliases: [...newPlace.aliases, newAlias.trim()],
      });
      setNewAlias("");
    }
  };

  const removeAlias = (index: number) => {
    setNewPlace({
      ...newPlace,
      aliases: newPlace.aliases.filter((_, i) => i !== index),
    });
  };

  const addEditAlias = () => {
    if (newAlias.trim() && !editPlace.aliases?.includes(newAlias.trim())) {
      setEditPlace({
        ...editPlace,
        aliases: [...(editPlace.aliases || []), newAlias.trim()],
      });
      setNewAlias("");
    }
  };

  const removeEditAlias = (index: number) => {
    setEditPlace({
      ...editPlace,
      aliases: editPlace.aliases?.filter((_, i) => i !== index) || [],
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">No data found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="p-6 flex flex-col gap-8 max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isEditingRegistry ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-4xl font-bold bg-transparent border-b-2 border-orange-300 dark:border-orange-600 focus:outline-none"
              />
            ) : (
              <h1 className="text-4xl font-bold">{data.title}</h1>
            )}
            {isEditingRegistry ? (
              <input
                type="text"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                className="text-sm bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-2 py-1 rounded border border-orange-300 dark:border-orange-700"
                placeholder="Version"
              />
            ) : (
              <span className="text-sm bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                v{data.version}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {isEditingRegistry ? (
              <>
                <button
                  onClick={handleSaveRegistry}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded font-medium"
                >
                  {saving ? "Saving..." : "Save Registry"}
                </button>
                <button
                  onClick={() => {
                    setIsEditingRegistry(false);
                    setEditTitle(data.title);
                    setEditVersion(data.version);
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditingRegistry(true)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium"
                >
                  Edit Registry
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                >
                  Add Place
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add Place Form */}
        {showAddForm && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold mb-4 text-blue-800 dark:text-blue-200">
              Add New Place
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Tag *
                </label>
                <input
                  type="text"
                  value={newPlace.tag}
                  onChange={(e) =>
                    setNewPlace({ ...newPlace, tag: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                  placeholder="place_hong_kong"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newPlace.name}
                  onChange={(e) =>
                    setNewPlace({ ...newPlace, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                  placeholder="Hong Kong"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Visibility
                </label>
                <select
                  value={newPlace.visibility}
                  onChange={(e) =>
                    setNewPlace({ ...newPlace, visibility: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Add Alias
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    className="flex-1 px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                    placeholder="Alias"
                    onKeyPress={(e) => e.key === "Enter" && addAlias()}
                  />
                  <button
                    onClick={addAlias}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                Notes
              </label>
              <textarea
                value={newPlace.notes}
                onChange={(e) =>
                  setNewPlace({ ...newPlace, notes: e.target.value })
                }
                className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                rows={3}
                placeholder="Enter notes about this place..."
              />
            </div>

            {newPlace.aliases.length > 0 && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                  Aliases:
                </label>
                <div className="flex flex-wrap gap-2">
                  {newPlace.aliases.map((alias, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded text-sm"
                    >
                      {alias}
                      <button
                        onClick={() => removeAlias(index)}
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddPlace}
                disabled={saving || !newPlace.tag || !newPlace.name}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded font-medium"
              >
                {saving ? "Adding..." : "Add Place"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewPlace({
                    tag: "",
                    name: "",
                    aliases: [],
                    notes: "",
                    visibility: "public",
                  });
                  setNewAlias("");
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          <h2 className="text-2xl font-bold mb-4">Place Registry</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Total places: {data.places.length}
          </p>

          <div className="grid gap-4">
            {data.places.map((place, index) => (
              <div
                key={index}
                className="bg-white dark:bg-zinc-700 rounded-lg p-4 border border-zinc-200 dark:border-zinc-600"
              >
                {editingPlace === place.tag ? (
                  <div className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={editPlace.name || ""}
                          onChange={(e) =>
                            setEditPlace({ ...editPlace, name: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Visibility
                        </label>
                        <select
                          value={editPlace.visibility || ""}
                          onChange={(e) =>
                            setEditPlace({
                              ...editPlace,
                              visibility: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Add Alias
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                          placeholder="Alias"
                          onKeyPress={(e) =>
                            e.key === "Enter" && addEditAlias()
                          }
                        />
                        <button
                          onClick={addEditAlias}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {(editPlace.aliases || []).length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          Aliases:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(editPlace.aliases || []).map(
                            (alias, aliasIndex) => (
                              <span
                                key={aliasIndex}
                                className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded text-sm"
                              >
                                {alias}
                                <button
                                  onClick={() => removeEditAlias(aliasIndex)}
                                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                                >
                                  ×
                                </button>
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Notes
                      </label>
                      <textarea
                        value={editPlace.notes || ""}
                        onChange={(e) =>
                          setEditPlace({ ...editPlace, notes: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                        rows={3}
                        placeholder="Enter notes about this place..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdatePlace}
                        disabled={saving}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded text-sm"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPlace(null);
                          setEditPlace({
                            tag: "",
                            name: "",
                            aliases: [],
                            notes: "",
                            visibility: "public",
                          });
                        }}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold">{place.name}</h3>
                      <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                        {place.visibility}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        Tag:
                      </span>
                      <code className="ml-2 text-sm bg-zinc-200 dark:bg-zinc-600 px-2 py-1 rounded">
                        {place.tag}
                      </code>
                    </div>

                    {place.aliases.length > 0 && (
                      <div className="mb-2">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          Aliases:
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {place.aliases.map((alias, aliasIndex) => (
                            <span
                              key={aliasIndex}
                              className="text-sm bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {place.notes && (
                      <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-600 rounded border-l-4 border-blue-500">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          Notes:
                        </span>
                        <p className="text-sm mt-1 text-zinc-700 dark:text-zinc-300">
                          {place.notes}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => startEditPlace(place)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePlace(place.tag)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(data.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
