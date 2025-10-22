import React, { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import { useAiStore, type DocumentInfo, type AiPrompt } from "@/stores";

interface ExtractionModalProps {
  document: DocumentInfo | null;
  onClose: () => void;
  onExtract: (doc: DocumentInfo, prompt: string) => void;
}

export default function ExtractionModal({
  document,
  onClose,
  onExtract,
}: ExtractionModalProps) {
  const { getAiPrompt } = useAiStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [prompt, setPrompt] = useState<AiPrompt | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch prompt when document changes
  useEffect(() => {
    if (!document) return;

    const promptId = `${document.namespace}.extract_${document.kind}`;
    setLoading(true);
    setError(null);

    getAiPrompt(promptId)
      .then((p) => {
        setPrompt(p);
        setEditedPrompt(p.prompt_template);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load prompt");
        setLoading(false);
      });
  }, [document, getAiPrompt]);

  // Reset state when modal closes
  useEffect(() => {
    if (!document) {
      setStep(1);
      setPrompt(null);
      setEditedPrompt("");
      setError(null);
    }
  }, [document]);

  if (!document) return null;

  const handleExtract = () => {
    // TODO: Implement extraction
    console.log("Extracting with prompt:", editedPrompt);
    onExtract(document, editedPrompt);
  };

  return (
    <Modal
      isOpen={!!document}
      onClose={onClose}
      title="Extract from document"
      subtitle={`${document.title} • Step ${step} of 2`}
      size="4xl"
    >
      <div className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 pb-4">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            1
          </div>
          <div className="flex-1 h-1 bg-gray-200 rounded">
            <div
              className={`h-full rounded transition-all ${
                step >= 2 ? "bg-blue-600 w-full" : "bg-gray-200 w-0"
              }`}
            />
          </div>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            2
          </div>
        </div>

        {/* Step 1: Configure Prompt */}
        {step === 1 && (
          <div className="space-y-4">
            {loading && (
              <div className="p-4 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-blue-800">Loading AI prompt...</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 rounded border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {prompt && !loading && (
              <>
                <div className="rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="font-semibold">Document:</span>{" "}
                      {document.title}
                    </div>
                    <div>
                      <span className="font-semibold">Type:</span>{" "}
                      {document.kind}
                    </div>
                    <div>
                      <span className="font-semibold">Task:</span> {prompt.task}
                    </div>
                    <div>
                      <span className="font-semibold">Model:</span>{" "}
                      {prompt.model || "default"}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    AI Prompt Template
                    <span className="ml-2 text-xs text-gray-500">
                      (editable)
                    </span>
                  </label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={12}
                    className="w-full border border-gray-300 rounded-lg p-4 font-mono text-xs resize-y"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {editedPrompt.length} characters
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={loading || !prompt}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extract
              </button>
            </div>
          </div>
        )}

        {/* Step 2: TODO - Review & Confirm */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
              <p className="text-sm text-yellow-800">
                TODO: Step 2 - Review extraction results
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
