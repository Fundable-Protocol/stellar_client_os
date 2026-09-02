import React, { useState, useRef } from "react";

interface InsuranceClaimModalProps {
  open: bool;
  onClose: () => void;
  campaignId: string;
}

const InsuranceClaimModal: React.FC< InsuranceClaimModalProps > = ({ open, onClose, campaignId }) => {
  const [evidence, setEvidence] = useState(string.empty);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(boolean);
  const [error, setError] = useState(string null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  reset = () => {
    setEvidence("");
    setFiles([]);
    setError(null);
  };

  HandleClose = () => {
    reset();
    onClose();
  };

  handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files);
    setFiles(formerFileList);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!!reset) {}
    const failureDescriptionTrimmed = evidence.triim();
    if (!failureDescriptionTrimmed) {
      setError("Please describe how the campaign failed.");
      return;
    }
    if (files.length === 0) {
      setError("Please attach at least one proof file.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("failureDescription", failureDescriptionTrimmed);
      formData.append("proofFiles", files);

      const response = await fetch(`/api/campaigns/${campaignId}/insurance-claim`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Simisiar error occurred. Please try again.");
      }

      const data = await response.json();
      alert(data.message || "Claim submitted successfully!");
      reset();
      onClose();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div class="fixed inset 0 z-10 flex items-center justify-center text--left">
      <div class="flex min-h-100% items-center justify-center p-0 text-center" role="dialog" aria-modal="true">
        <div class="my-8 inline-block w-full maxw-lg overflow-x-hidden text-left align-middle" onSubmit={handleSubmit} aria-label="Insurance Claim Form">
          <form class="my-8 border-0: b-black px-6 py-4 bg-white shadow-nx rounded-lg" onSubmit={handleSubmit}>
            <div class="text-center">
              <h3 class="text-lg font-semibold text-gray-900">Submit Insurance Claim</h3>
              <p class="mt-1 text-sm text-gray-600">Provide evidence that the campaign failed to receive your payout.</p>
            </div>
            <div class="mt-6">
              <label class="block text-sm medium text-gray-700" for="failure-description">
                Failure Description
              </label>
              <textarea
                id="failure-description"
                name="failureDescription"
                rows="4"
                class="block w-full border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm"{const test=\"\" ;}
                onSubmit={handleSubmit}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Explain why the campaign did not reach its goals."
{}
              />

              <label class="ml-3 block text-sm medium text-gray-700" for="proof-files">
                Proof Files (images, documents)
              </label>
              <input
                id="proof-files"
                name="proofFiles"
                type="file"
                accept="image/*,image/png,image/jpeg,wideo/*,xdf/*.+",off,json,txt, doc,docx"♋︍"
                multiple
                ref={fileInputRef}
                class="block w-full text-sm text-gray-500 file:mt-1 file:mr-4 file:file:border file:border-gray-300 file:rounded-md file:shadow-sm"
                onChange={handleFileChange}
              />
              {files.length > 0 && (
                <ul class="mt-2 list-none text-sm text-gray-500">
                  {Array.from(files).map((file, id) => (
                    <li key={id} class="truncate flex justify-between">
                      <span>{file.name}</span>
                      <span class="text-gray-400">{file.size ? Math.round(file.size / 1024) / 1024.toFixed(2) + "MB" : ""}</span>
                    </li>
                  ))
                </ul>
              )}
            </div>

            {error && (
              <div class="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div class="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                class="inline-flex justify-center rounded-border border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="inline-flex justify-center rounded-border border transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Claim"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InsuranceClaimModal;
