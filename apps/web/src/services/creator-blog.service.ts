/**
 * Creator Blog Service
 * 
 * Manages creator blog posts and updates feed where creators can post updates
 * across all their campaigns, building an audience over time.
 * Issue #1216
 */

export interface CreatorBlogPost {
  id: string;
  creatorAddress: string;
  campaignId?: string; // Optional: link to specific campaign
  title: string;
  content: string; // Markdown or HTML
  excerpt?: string;
  publishedAt: number;
  updatedAt?: number;
  status: "draft" | "published";
  tags?: string[];
  coverImageUrl?: string;
}

export interface BlogPostFilter {
  creatorAddress?: string;
  campaignId?: string;
  status?: "draft" | "published";
  tags?: string[];
  search?: string;
}

export interface BlogPostQueryInput {
  filter?: BlogPostFilter;
  limit?: number;
  offset?: number;
}

export interface CreatorBlogDataSource {
  getBlogPosts(query: BlogPostQueryInput): Promise<CreatorBlogPost[]>;
  getBlogPostById(id: string): Promise<CreatorBlogPost | null>;
  saveBlogPost(post: CreatorBlogPost): Promise<CreatorBlogPost>;
  deleteBlogPost(id: string): Promise<boolean>;
  getPostCount(filter: BlogPostFilter): Promise<number>;
}

export class InMemoryCreatorBlogDataSource implements CreatorBlogDataSource {
  private posts = new Map<string, CreatorBlogPost>();

  async getBlogPosts(query: BlogPostQueryInput): Promise<CreatorBlogPost[]> {
    let posts = Array.from(this.posts.values());

    // Apply filters
    if (query.filter) {
      const { creatorAddress, campaignId, status, tags, search } = query.filter;

      if (creatorAddress) {
        posts = posts.filter((post) => post.creatorAddress === creatorAddress);
      }

      if (campaignId) {
        posts = posts.filter((post) => post.campaignId === campaignId);
      }

      if (status) {
        posts = posts.filter((post) => post.status === status);
      }

      if (tags && tags.length > 0) {
        posts = posts.filter((post) =>
          post.tags?.some((tag) => tags.includes(tag))
        );
      }

      if (search) {
        const searchLower = search.toLowerCase();
        posts = posts.filter(
          (post) =>
            post.title.toLowerCase().includes(searchLower) ||
            post.content.toLowerCase().includes(searchLower) ||
            post.excerpt?.toLowerCase().includes(searchLower)
        );
      }
    }

    // Sort by publishedAt descending (newest first)
    posts.sort((a, b) => b.publishedAt - a.publishedAt);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    return posts.slice(offset, offset + limit);
  }

  async getBlogPostById(id: string): Promise<CreatorBlogPost | null> {
    return this.posts.get(id) || null;
  }

  async saveBlogPost(post: CreatorBlogPost): Promise<CreatorBlogPost> {
    this.posts.set(post.id, post);
    return post;
  }

  async deleteBlogPost(id: string): Promise<boolean> {
    return this.posts.delete(id);
  }

  async getPostCount(filter: BlogPostFilter): Promise<number> {
    const posts = await this.getBlogPosts({ filter, limit: Number.MAX_SAFE_INTEGER });
    return posts.length;
  }
}

let defaultBlogDataSource: CreatorBlogDataSource | undefined;

export function getCreatorBlogDataSource(): CreatorBlogDataSource {
  if (!defaultBlogDataSource) {
    defaultBlogDataSource = new InMemoryCreatorBlogDataSource();
  }
  return defaultBlogDataSource;
}

export function setCreatorBlogDataSource(source: CreatorBlogDataSource): void {
  defaultBlogDataSource = source;
}

/**
 * Generate a short excerpt from content if not provided
 */
export function generateExcerpt(content: string, maxLength: number = 200): string {
  // Strip HTML/Markdown tags for excerpt
  const stripped = content
    .replace(/<[^>]*>/g, "")
    .replace(/[#*_~`]/g, "")
    .trim();

  if (stripped.length <= maxLength) {
    return stripped;
  }

  return stripped.substring(0, maxLength).trim() + "...";
}

/**
 * Validate blog post input
 */
export function validateBlogPost(post: Partial<CreatorBlogPost>): {
  isValid: boolean;
  error?: string;
} {
  if (!post.title || post.title.trim().length === 0) {
    return { isValid: false, error: "Title is required" };
  }

  if (post.title.length > 200) {
    return { isValid: false, error: "Title must be 200 characters or less" };
  }

  if (!post.content || post.content.trim().length === 0) {
    return { isValid: false, error: "Content is required" };
  }

  if (post.content.length > 50000) {
    return { isValid: false, error: "Content must be 50,000 characters or less" };
  }

  if (!post.creatorAddress || post.creatorAddress.trim().length === 0) {
    return { isValid: false, error: "Creator address is required" };
  }

  if (post.status && !["draft", "published"].includes(post.status)) {
    return { isValid: false, error: "Status must be 'draft' or 'published'" };
  }

  return { isValid: true };
}
