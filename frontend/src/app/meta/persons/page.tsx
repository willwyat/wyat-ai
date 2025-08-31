"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type Person = {
  tag: string;
  name: string;
  nicknames: string[];
  visibility: string;
};

type PersonRegistry = {
  _id: string;
  type: string;
  title: string;
  version: string;
  persons: Person[];
  createdAt: string;
  updatedAt: string;
};

type AddPersonRequest = {
  tag: string;
  name: string;
  nicknames: string[];
  visibility: string;
};

type UpdatePersonRequest = {
  tag: string;
  name?: string;
  nicknames?: string[];
  visibility?: string;
};

export default function PersonsPage() {
  const [data, setData] = useState<PersonRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingRegistry, setIsEditingRegistry] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add person form state
  const [newPerson, setNewPerson] = useState<AddPersonRequest>({
    tag: "",
    name: "",
    nicknames: [],
    visibility: "public",
  });
  const [newNickname, setNewNickname] = useState("");

  // Edit person form state
  const [editPerson, setEditPerson] = useState<UpdatePersonRequest>({
    tag: "",
    name: "",
    nicknames: [],
    visibility: "public",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/meta/person-registry`, {
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
      const response = await fetch(`${API_URL}/meta/person-registry`, {
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

  const handleAddPerson = async () => {
    if (!newPerson.tag || !newPerson.name) {
      alert("Tag and name are required!");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/persons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(newPerson),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Failed to add: ${response.status}`
        );
      }

      await fetchData(); // Refresh data
      setShowAddForm(false);
      setNewPerson({ tag: "", name: "", nicknames: [], visibility: "public" });
      setNewNickname("");
      alert("Person added successfully!");
    } catch (err) {
      alert(
        `Error adding person: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePerson = async () => {
    if (!editPerson.tag) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/persons`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(editPerson),
      });

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      await fetchData(); // Refresh data
      setEditingPerson(null);
      setEditPerson({ tag: "", name: "", nicknames: [], visibility: "public" });
      alert("Person updated successfully!");
    } catch (err) {
      alert(
        `Error updating person: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePerson = async (tag: string) => {
    if (!confirm(`Are you sure you want to delete person with tag "${tag}"?`))
      return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/persons/${tag}`, {
        method: "DELETE",
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      await fetchData(); // Refresh data
      alert("Person deleted successfully!");
    } catch (err) {
      alert(
        `Error deleting person: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const startEditPerson = (person: Person) => {
    setEditingPerson(person.tag);
    setEditPerson({
      tag: person.tag,
      name: person.name,
      nicknames: [...person.nicknames],
      visibility: person.visibility,
    });
  };

  const addNickname = () => {
    if (
      newNickname.trim() &&
      !newPerson.nicknames.includes(newNickname.trim())
    ) {
      setNewPerson({
        ...newPerson,
        nicknames: [...newPerson.nicknames, newNickname.trim()],
      });
      setNewNickname("");
    }
  };

  const removeNickname = (index: number) => {
    setNewPerson({
      ...newPerson,
      nicknames: newPerson.nicknames.filter((_, i) => i !== index),
    });
  };

  const addEditNickname = () => {
    if (
      newNickname.trim() &&
      !editPerson.nicknames?.includes(newNickname.trim())
    ) {
      setEditPerson({
        ...editPerson,
        nicknames: [...(editPerson.nicknames || []), newNickname.trim()],
      });
      setNewNickname("");
    }
  };

  const removeEditNickname = (index: number) => {
    setEditPerson({
      ...editPerson,
      nicknames: editPerson.nicknames?.filter((_, i) => i !== index) || [],
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
                className="text-4xl font-bold bg-transparent border-b-2 border-purple-300 dark:border-purple-600 focus:outline-none"
              />
            ) : (
              <h1 className="text-4xl font-bold">{data.title}</h1>
            )}
            {isEditingRegistry ? (
              <input
                type="text"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                className="text-sm bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded border border-purple-300 dark:border-purple-700"
                placeholder="Version"
              />
            ) : (
              <span className="text-sm bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
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
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium"
                >
                  Edit Registry
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                >
                  Add Person
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add Person Form */}
        {showAddForm && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold mb-4 text-blue-800 dark:text-blue-200">
              Add New Person
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Tag *
                </label>
                <input
                  type="text"
                  value={newPerson.tag}
                  onChange={(e) =>
                    setNewPerson({ ...newPerson, tag: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                  placeholder="person_john_doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newPerson.name}
                  onChange={(e) =>
                    setNewPerson({ ...newPerson, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Visibility
                </label>
                <select
                  value={newPerson.visibility}
                  onChange={(e) =>
                    setNewPerson({ ...newPerson, visibility: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Add Nickname
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="flex-1 px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-zinc-700 text-blue-900 dark:text-blue-100"
                    placeholder="Nickname"
                    onKeyPress={(e) => e.key === "Enter" && addNickname()}
                  />
                  <button
                    onClick={addNickname}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {newPerson.nicknames.length > 0 && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                  Nicknames:
                </label>
                <div className="flex flex-wrap gap-2">
                  {newPerson.nicknames.map((nickname, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm"
                    >
                      {nickname}
                      <button
                        onClick={() => removeNickname(index)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
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
                onClick={handleAddPerson}
                disabled={saving || !newPerson.tag || !newPerson.name}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded font-medium"
              >
                {saving ? "Adding..." : "Add Person"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewPerson({
                    tag: "",
                    name: "",
                    nicknames: [],
                    visibility: "public",
                  });
                  setNewNickname("");
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          <h2 className="text-2xl font-bold mb-4">Person Registry</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Total persons: {data.persons.length}
          </p>

          <div className="grid gap-4">
            {data.persons.map((person, index) => (
              <div
                key={index}
                className="bg-white dark:bg-zinc-700 rounded-lg p-4 border border-zinc-200 dark:border-zinc-600"
              >
                {editingPerson === person.tag ? (
                  <div className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={editPerson.name || ""}
                          onChange={(e) =>
                            setEditPerson({
                              ...editPerson,
                              name: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Visibility
                        </label>
                        <select
                          value={editPerson.visibility || ""}
                          onChange={(e) =>
                            setEditPerson({
                              ...editPerson,
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
                        Add Nickname
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newNickname}
                          onChange={(e) => setNewNickname(e.target.value)}
                          className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                          placeholder="Nickname"
                          onKeyPress={(e) =>
                            e.key === "Enter" && addEditNickname()
                          }
                        />
                        <button
                          onClick={addEditNickname}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {(editPerson.nicknames || []).length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          Nicknames:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(editPerson.nicknames || []).map(
                            (nickname, nickIndex) => (
                              <span
                                key={nickIndex}
                                className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm"
                              >
                                {nickname}
                                <button
                                  onClick={() => removeEditNickname(nickIndex)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                                >
                                  ×
                                </button>
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdatePerson}
                        disabled={saving}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded text-sm"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPerson(null);
                          setEditPerson({
                            tag: "",
                            name: "",
                            nicknames: [],
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
                      <h3 className="text-lg font-semibold">{person.name}</h3>
                      <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                        {person.visibility}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        Tag:
                      </span>
                      <code className="ml-2 text-sm bg-zinc-200 dark:bg-zinc-600 px-2 py-1 rounded">
                        {person.tag}
                      </code>
                    </div>

                    {person.nicknames.length > 0 && (
                      <div>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          Nicknames:
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {person.nicknames.map((nickname, nickIndex) => (
                            <span
                              key={nickIndex}
                              className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded"
                            >
                              {nickname}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => startEditPerson(person)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePerson(person.tag)}
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
