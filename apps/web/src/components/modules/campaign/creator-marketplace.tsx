"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  Search,
  Filter,
  Plus,
  Star,
  Download,
  FileText,
  DollarSign,
  CheckCircle2,
  ShieldCheck,
  Tag,
  BookOpen,
  Sparkles,
  Layers,
  ArrowRight,
  ExternalLink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface MarketplaceItem {
  id: string;
  title: string;
  category: "templates" | "copywriting" | "financial" | "marketing" | "guides";
  categoryLabel: string;
  description: string;
  price: number;
  token: "XLM" | "USDC";
  seller: {
    name: string;
    verified: boolean;
    rating: number;
    salesCount: number;
    avatar?: string;
  };
  fileFormats: string[];
  includedAssets: string[];
  reviewsCount: number;
  previewUrl?: string;
  isPopular?: boolean;
}

export const MOCK_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: "item-001",
    title: "Complete Soroban Crowdfunding Pitch & Copy Toolkit",
    category: "copywriting",
    categoryLabel: "Copywriting & Pitch Templates",
    description: "High-converting campaign story structure, email announcement sequences, social media posts, and pitch deck outline optimized for Stellar crypto backers.",
    price: 45,
    token: "USDC",
    seller: {
      name: "Alex Vance (Funded $500k+)",
      verified: true,
      rating: 4.9,
      salesCount: 142,
    },
    fileFormats: ["Notion", "Google Docs", "Markdown"],
    includedAssets: [
      "10-Step Story Structure Blueprint",
      "5x Email Backer Nurture Sequence",
      "Stellar/Soroban Technical Pitch Deck Template",
      "PR & Media Press Release Sheet",
    ],
    reviewsCount: 38,
    isPopular: true,
  },
  {
    id: "item-002",
    title: "Campaign Financial Budget & Tokenomics Calculator",
    category: "financial",
    categoryLabel: "Financial Planning & Tokenomics",
    description: "Excel & Notion financial models for forecasting goal milestones, platform fee splits, reward fulfillment costs, and Soroban gas fee estimates.",
    price: 120,
    token: "XLM",
    seller: {
      name: "StellarMetrics Pro",
      verified: true,
      rating: 4.8,
      salesCount: 89,
    },
    fileFormats: ["Excel", "Google Sheets", "Notion"],
    includedAssets: [
      "Dynamic Goal Sensitivity Model",
      "Reward Fulfillment Margin Calculator",
      "Stellar XLM/USDC Volatility Hedge Matrix",
      "Milestone Escrow Payout Schedule Sheet",
    ],
    reviewsCount: 22,
  },
  {
    id: "item-003",
    title: "Web3 Campaign Pre-Launch & Community Building OS",
    category: "marketing",
    categoryLabel: "Marketing & Outreach",
    description: "Battle-tested 30-day pre-launch plan to build a 2,000+ Discord waitlist before launching your crowdfunding campaign on Stellar.",
    price: 60,
    token: "USDC",
    seller: {
      name: "LaunchPad DAO",
      verified: true,
      rating: 5.0,
      salesCount: 215,
    },
    fileFormats: ["Notion", "Figma", "PDF"],
    includedAssets: [
      "30-Day Pre-Launch Content Calendar",
      "Discord & Telegram Automation Bot Config",
      "Influencer Outreach Email Templates",
      "Figma Social Banner Graphics Suite",
    ],
    reviewsCount: 64,
    isPopular: true,
  },
  {
    id: "item-004",
    title: "NFT & Reward Tier Design Blueprint & Guide",
    category: "templates",
    categoryLabel: "Campaign Templates",
    description: "Comprehensive guide for pricing digital perks, utility NFTs, and physical rewards for maximum backer conversion.",
    price: 75,
    token: "XLM",
    seller: {
      name: "Elena Rostova",
      verified: false,
      rating: 4.6,
      salesCount: 47,
    },
    fileFormats: ["PDF", "Figma"],
    includedAssets: [
      "Tier Pricing Matrix Guide",
      "Reward Delivery Logistic Checklist",
      "Figma Badge Design Assets",
    ],
    reviewsCount: 11,
  },
];

export function CreatorMarketplace() {
  const [items, setItems] = useState<MarketplaceItem[]>(MOCK_MARKETPLACE_ITEMS);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState<boolean>(false);
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  // New listing form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<MarketplaceItem["category"]>("templates");
  const [newPrice, setNewPrice] = useState("");
  const [newToken, setNewToken] = useState<"XLM" | "USDC">("USDC");
  const [newDescription, setNewDescription] = useState("");
  const [newAssets, setNewAssets] = useState("");

  const filteredItems = items.filter((item) => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.seller.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handlePurchase = (item: MarketplaceItem) => {
    setIsPurchasing(true);
    setTimeout(() => {
      setPurchasedIds([...purchasedIds, item.id]);
      setIsPurchasing(false);
      setSelectedItem(null);
    }, 1000);
  };

  const handleCreateListing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newPrice || !newDescription) return;

    const newItem: MarketplaceItem = {
      id: `item-${Date.now()}`,
      title: newTitle,
      category: newCategory,
      categoryLabel:
        newCategory === "copywriting"
          ? "Copywriting & Pitch Templates"
          : newCategory === "financial"
          ? "Financial Planning & Tokenomics"
          : newCategory === "marketing"
          ? "Marketing & Outreach"
          : "Campaign Templates",
      description: newDescription,
      price: parseFloat(newPrice),
      token: newToken,
      seller: {
        name: "Current Creator (You)",
        verified: true,
        rating: 5.0,
        salesCount: 0,
      },
      fileFormats: ["Notion", "PDF", "Markdown"],
      includedAssets: newAssets ? newAssets.split("\n").filter(Boolean) : ["Standard Template Guide", "Asset Checklist"],
      reviewsCount: 0,
    };

    setItems([newItem, ...items]);
    setIsSellModalOpen(false);
    setNewTitle("");
    setNewPrice("");
    setNewDescription("");
    setNewAssets("");
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-purple-950/80 text-purple-300 border-purple-800 text-xs">
              Feature #786
            </Badge>
            <span className="text-xs text-zinc-400">Creator Economy & Toolkit Hub</span>
          </div>
          <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-purple-400" />
            Creator Marketplace
          </h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Buy and sell campaign planning templates, copywriting frameworks, financial calculators, and launch toolkits crafted by experienced Stellar creators.
          </p>
        </div>

        <Button
          onClick={() => setIsSellModalOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold text-white hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-900/30"
        >
          <Plus className="mr-2 h-4 w-4" /> Sell Your Toolkit
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-900/80 p-4 rounded-xl border border-zinc-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search templates, guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-700 text-xs text-zinc-200"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All Assets" },
            { id: "copywriting", label: "Copywriting & Pitch" },
            { id: "financial", label: "Financial Models" },
            { id: "marketing", label: "Marketing OS" },
            { id: "templates", label: "Templates" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? "bg-purple-600 text-white shadow-md shadow-purple-950"
                  : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredItems.map((item) => {
          const isPurchased = purchasedIds.includes(item.id);

          return (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 flex flex-col justify-between space-y-5 shadow-xl hover:border-purple-500/40 transition-all duration-300 relative group"
            >
              {item.isPopular && (
                <Badge className="absolute top-4 right-4 bg-amber-950 text-amber-300 border-amber-800 text-[10px] flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Best Seller
                </Badge>
              )}

              <div className="space-y-3">
                <Badge variant="outline" className="border-purple-800 text-purple-300 bg-purple-950/40 text-[10px]">
                  {item.categoryLabel}
                </Badge>
                <h3 className="text-xl font-bold text-zinc-100 group-hover:text-purple-300 transition-colors leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{item.description}</p>
              </div>

              {/* Included Assets */}
              <div className="space-y-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-purple-400" /> What's Included:
                </span>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {item.includedAssets.slice(0, 3).map((asset, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px]">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                      <span className="truncate">{asset}</span>
                    </li>
                  ))}
                  {item.includedAssets.length > 3 && (
                    <li className="text-[10px] text-purple-400 italic font-medium">
                      +{item.includedAssets.length - 3} more assets included
                    </li>
                  )}
                </ul>
              </div>

              {/* Creator Info & Price */}
              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-200 font-semibold">
                    <span>{item.seller.name}</span>
                    {item.seller.verified && (
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-400 inline" title="Verified Creator" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                      <Star className="h-3 w-3 fill-amber-400" /> {item.seller.rating.toFixed(1)}
                    </span>
                    <span>• {item.seller.salesCount} sold</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400">
                    {item.price} {item.token}
                  </div>
                  <div className="flex gap-1 justify-end">
                    {item.fileFormats.map((fmt) => (
                      <span key={fmt} className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedItem(item)}
                  className="w-1/2 border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 text-xs"
                >
                  <BookOpen className="mr-1.5 h-3.5 w-3.5 text-purple-400" /> Details & Preview
                </Button>

                {isPurchased ? (
                  <Button className="w-1/2 bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 text-xs font-bold">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download Toolkit
                  </Button>
                ) : (
                  <Button
                    onClick={() => setSelectedItem(item)}
                    className="w-1/2 bg-gradient-to-r from-purple-600 to-emerald-600 text-white font-semibold hover:from-purple-700 hover:to-emerald-700 text-xs shadow-md shadow-purple-950"
                  >
                    Buy Toolkit <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Item Detail / Purchase Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-xl w-full space-y-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-2">
              <Badge variant="outline" className="border-purple-800 text-purple-300 bg-purple-950/40 text-[10px]">
                {selectedItem.categoryLabel}
              </Badge>
              <h2 className="text-2xl font-bold text-zinc-50">{selectedItem.title}</h2>
              <p className="text-xs text-zinc-400">{selectedItem.description}</p>
            </div>

            <div className="space-y-3 bg-zinc-950/80 p-4 rounded-lg border border-zinc-800">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-400" /> Complete Included Asset Bundle
              </span>
              <ul className="space-y-2 text-xs text-zinc-200">
                {selectedItem.includedAssets.map((asset, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>{asset}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <div>
                <span className="text-xs text-zinc-400 block">Creator Seller</span>
                <span className="text-sm font-bold text-zinc-100 flex items-center gap-1">
                  {selectedItem.seller.name}
                  {selectedItem.seller.verified && <ShieldCheck className="h-4 w-4 text-blue-400" />}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-zinc-400 block">Price</span>
                <span className="text-xl font-black text-emerald-400">
                  {selectedItem.price} {selectedItem.token}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedItem(null)}
                className="w-1/3 border-zinc-700 bg-transparent text-zinc-300"
              >
                Cancel
              </Button>
              {purchasedIds.includes(selectedItem.id) ? (
                <Button className="w-2/3 bg-emerald-600 text-white font-bold hover:bg-emerald-700">
                  <Download className="mr-2 h-4 w-4" /> Download Files Now
                </Button>
              ) : (
                <Button
                  onClick={() => handlePurchase(selectedItem)}
                  disabled={isPurchasing}
                  className="w-2/3 bg-gradient-to-r from-purple-600 to-emerald-600 font-bold text-white hover:from-purple-700 hover:to-emerald-700"
                >
                  {isPurchasing ? "Processing Wallet Transaction..." : `Confirm Purchase (${selectedItem.price} ${selectedItem.token})`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* List Your Toolkit Modal */}
      {isSellModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateListing}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-xl w-full space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setIsSellModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <h2 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
                <Plus className="h-5 w-5 text-purple-400" /> Sell Your Campaign Toolkit
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Share your expertise with new creators and earn XLM/USDC on every sale.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300">Toolkit Title</label>
                <Input
                  required
                  placeholder="e.g. Ultimate Soroban Campaign Copywriting Bundle"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="bg-zinc-950 border-zinc-700 text-xs text-zinc-200 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded-md p-2 mt-1 focus:outline-none"
                  >
                    <option value="copywriting">Copywriting & Pitch</option>
                    <option value="financial">Financial Planning</option>
                    <option value="marketing">Marketing OS</option>
                    <option value="templates">Campaign Templates</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300">Price</label>
                    <Input
                      required
                      type="number"
                      placeholder="50"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-xs text-zinc-200 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-300">Token</label>
                    <select
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded-md p-2 mt-1 focus:outline-none"
                    >
                      <option value="USDC">USDC</option>
                      <option value="XLM">XLM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain what problem this toolkit solves for new campaign creators..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded-md p-2 mt-1 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300">Included Assets (One per line)</label>
                <textarea
                  rows={3}
                  placeholder="Notion Campaign Board&#10;Email sequence PDF&#10;Pitch deck slides"
                  value={newAssets}
                  onChange={(e) => setNewAssets(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded-md p-2 mt-1 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSellModalOpen(false)}
                className="border-zinc-700 bg-transparent text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold">
                Publish Marketplace Listing
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CreatorMarketplace;
