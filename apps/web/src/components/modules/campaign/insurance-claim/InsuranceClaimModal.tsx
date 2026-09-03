import React, { useState, useRef } from "react";

interface InsuranceClaimModalProps {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}

const InsuranceClaimModal: React.FC<InsuranceClaimModalProps> = ({ open, onClose, campaignId }) => {
  const [evidence, setEvidence] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setEvidence("");
    setFiles([]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files ?? []);
    setFiles(fileList);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    reset();
    const failureDescriptionTrimmed = evidence.trim();
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
        throw new Error("An error occurred. Please try again.");
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
    <div className="fixed inset-0 z-10 flex items-center justify-center text-left">
      <div className="flex min-h-full items-center justify-center p-0 text-center" role="dialog" aria-modal="true">
        <div className="my-8 inline-block w-full max-w-lg overflow-x-hidden text-left align-middle" aria-label="Insurance Claim Form">
          <form className="my-8 border-0 border-black px-6 py-4 bg-white shadow-lg rounded-lg" onSubmit={handleSubmit}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">Submit Insurance Claim</h3>
              <p className="mt-1 text-sm text-gray-600">Provide evidence that the campaign failed to receive your payout.</p>
            </div>
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700" htmlFor="failure-description">
                Failure Description
              </label>
              <textarea
                id="failure-description"
                name="failureDescription"
                rows={4}
                className="block w-full border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm rounded-md border"
                onSubmit={handleSubmit}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Explain why the campaign did not reach its goals."
              />

              <label className="mt-4 ml-0 block text-sm font-medium text-gray-700" htmlFor="proof-files">
                Proof Files (images, documents)
              </label>
              <input
                id="proof-files"
                name="proofFiles"
                type="file"
                accept="image/*,application/pdf,.json,.txt,.doc,.docx"
                multiple
                ref={fileInputRef}
                className="block w-full text-sm text-gray-500 file:mt-1 file:mr-4 file:border file:border-gray-300 file:rounded-md file:shadow-sm"
                onChange={handleFileChange}
              />
              {files.length > 0 && (
                <ul className="mt-2 list-none text-sm text-gray-500">
                  {Array.from(files).map((file, id) => (
                    <li key={id} className="truncate flex justify-between">
                      <span>{file.name}</span>
                      <span className="text-gray-400">{file.size ? (Math.round(file.size / 1024) / 1024).toFixed(2) + "MB" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
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
