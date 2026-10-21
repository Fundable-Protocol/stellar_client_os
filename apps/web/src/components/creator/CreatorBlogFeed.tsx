"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Tag, ExternalLink, PenSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/providers/StellarWalletProvider";
import type { CreatorBlogPost } from "@/services/creator-blog.service";
import Link from "next/link";

export interface CreatorBlogFeedProps {
  creatorAddress: string;
}

export function CreatorBlogFeed({ creatorAddress }: CreatorBlogFeedProps) {
  const { address, isConnected } = useWallet();
  const isCreator = isConnected && address?.toLowerCase() === creatorAddress.toLowerCase();

  const [posts, setPosts] = useState<CreatorBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
  }, [creatorAddress]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/creators/${creatorAddress}/blog?status=published`);
      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
      } else {
        setError(data.error || "Failed to load blog posts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const response = await fetch(`/api/creators/${creatorAddress}/blog/${postId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } else {
        alert(data.error || "Failed to delete post");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete post");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-200 bg-white p-6"
          >
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <Button onClick={loadPosts} className="mt-4" variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Creator Blog & Updates
        </h2>
        {isCreator && (
          <Button className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2">
            <PenSquare className="h-4 w-4" />
            New Post
          </Button>
        )}
      </div>

      {/* Blog Posts List */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <PenSquare className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No blog posts yet
          </h3>
          <p className="text-gray-600">
            {isCreator
              ? "Share updates about your campaigns and build your audience."
              : "Check back later for updates from this creator."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* Cover Image */}
              {post.coverImageUrl && (
                <div className="aspect-[21/9] w-full bg-gray-100">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div className="p-6">
                {/* Post Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(post.publishedAt)}
                      </span>
                      {post.updatedAt && (
                        <span className="text-xs">
                          Updated {formatDate(post.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {isCreator && (
                    <div className="flex items-center gap-2 ml-4">
                      <Button size="sm" variant="outline">
                        <PenSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(post.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Post Excerpt */}
                <p className="text-gray-700 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Tag className="h-4 w-4 text-gray-400" />
                    {post.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Campaign Link */}
                {post.campaignId && (
                  <Link
                    href={`/campaigns/${post.campaignId}`}
                    className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 mb-4"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Related Campaign
                  </Link>
                )}

                {/* Read More */}
                <div className="pt-4 border-t border-gray-100">
                  <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700">
                    Read Full Post →
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
