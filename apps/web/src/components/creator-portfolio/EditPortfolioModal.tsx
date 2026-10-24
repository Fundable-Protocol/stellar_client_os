'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CreatorPortfolioProfile, SocialLink, UpdatePortfolioInput } from '@/types/creator-portfolio';

interface EditPortfolioModalProps {
  profile: CreatorPortfolioProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: UpdatePortfolioInput) => Promise<void>;
}

export function EditPortfolioModal({
  profile,
  isOpen,
  onClose,
  onSave,
}: EditPortfolioModalProps) {
  const [formData, setFormData] = useState<UpdatePortfolioInput>({
    displayName: profile.displayName,
    bio: profile.bio,
    websiteUrl: profile.websiteUrl,
    socialLinks: profile.socialLinks,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddSocialLink = () => {
    setFormData((prev) => ({
      ...prev,
      socialLinks: [
        ...(prev.socialLinks || []),
        {
          platform: 'website' as const,
          url: '',
        },
      ],
    }));
  };

  const handleUpdateSocialLink = (index: number, field: string, value: string) => {
    setFormData((prev) => {
      const updated = [...(prev.socialLinks || [])];
      updated[index] = {
        ...updated[index],
        [field]: value,
      } as SocialLink;
      return {
        ...prev,
        socialLinks: updated,
      };
    });
  };

  const handleRemoveSocialLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks?.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save portfolio');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Edit Portfolio</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
              {error}
            </div>
          )}

          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={formData.displayName || ''}
              onChange={handleInputChange}
              maxLength={100}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Your creator name"
            />
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio || ''}
              onChange={handleInputChange}
              maxLength={500}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              placeholder="Tell backers about your mission and impact..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {(formData.bio || '').length}/500 characters
            </p>
          </div>

          {/* Website URL */}
          <div>
            <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <input
              type="url"
              id="websiteUrl"
              name="websiteUrl"
              value={formData.websiteUrl || ''}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="https://example.com"
            />
          </div>

          {/* Social Links */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Social Links
              </label>
              <button
                type="button"
                onClick={handleAddSocialLink}
                disabled={(formData.socialLinks?.length || 0) >= 10}
                className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                + Add Link
              </button>
            </div>

            <div className="space-y-3">
              {formData.socialLinks?.map((link, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={link.platform}
                    onChange={(e) =>
                      handleUpdateSocialLink(idx, 'platform', e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="twitter">Twitter</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="github">GitHub</option>
                    <option value="website">Website</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Username or URL"
                    value={link.username || link.url}
                    onChange={(e) =>
                      handleUpdateSocialLink(idx, 'username', e.target.value)
                    }
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveSocialLink(idx)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
