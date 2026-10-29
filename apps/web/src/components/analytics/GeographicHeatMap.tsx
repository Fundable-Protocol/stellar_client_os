"use client";

/**
 * Geographic Heat Map Component - Issue #1339
 * 
 * Interactive SVG world map showing backer density by country.
 * Features:
 * - Color-coded regions based on backer density
 * - Tooltips showing detailed stats
 * - Filterable by pledge tiers and date ranges
 * - Exportable as PNG/SVG
 */

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Filter } from "lucide-react";
import type { GeographicBackerData, GeographicHeatMapResponse } from "@/app/api/analytics/geographic/route";

interface GeographicHeatMapProps {
  creatorAddress: string;
  campaignId?: string;
  className?: string;
}

interface HeatMapFilters {
  pledgeTiers?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
}

export function GeographicHeatMap({
  creatorAddress,
  campaignId,
  className = "",
}: GeographicHeatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [filters, setFilters] = useState<HeatMapFilters>({});
  const [hoveredCountry, setHoveredCountry] = useState<GeographicBackerData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Fetch geographic data
  const { data, isLoading, error } = useQuery<GeographicHeatMapResponse>({
    queryKey: ["geographic-heatmap", creatorAddress, campaignId, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ creatorAddress });
      if (campaignId) params.append("campaignId", campaignId);
      if (filters.pledgeTiers) params.append("pledgeTier", filters.pledgeTiers.join(","));
      if (filters.dateRange) {
        params.append("from", filters.dateRange.from);
        params.append("to", filters.dateRange.to);
      }

      const response = await fetch(`/api/analytics/geographic?${params}`);
      if (!response.ok) throw new Error("Failed to fetch geographic data");
      return response.json();
    },
  });

  // Calculate color intensity based on backer count
  const getCountryColor = (countryCode: string): string => {
    if (!data) return "#e5e7eb"; // gray-200

    const countryData = data.data.find((d) => d.countryCode === countryCode);
    if (!countryData) return "#e5e7eb";

    const maxBackers = Math.max(...data.data.map((d) => d.backerCount));
    const intensity = countryData.backerCount / maxBackers;

    // Color scale from light purple to dark purple
    const baseColor = { r: 147, g: 51, b: 234 }; // purple-600
    const lightness = 1 - intensity * 0.7; // 0.3 to 1.0 range

    return `rgb(${Math.round(baseColor.r * lightness + 229 * (1 - lightness))}, ${Math.round(baseColor.g * lightness + 231 * (1 - lightness))}, ${Math.round(baseColor.b * lightness + 235 * (1 - lightness))})`;
  };

  const handleCountryHover = (
    countryCode: string,
    event: React.MouseEvent<SVGPathElement>
  ) => {
    const countryData = data?.data.find((d) => d.countryCode === countryCode);
    if (countryData) {
      setHoveredCountry(countryData);
      setTooltipPos({ x: event.clientX, y: event.clientY });
    }
  };

  const handleCountryLeave = () => {
    setHoveredCountry(null);
  };

  // Export as SVG
  const exportAsSVG = () => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `geographic-heatmap-${Date.now()}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  // Export as PNG
  const exportAsPNG = () => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    canvas.width = 1200;
    canvas.height = 600;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = `geographic-heatmap-${Date.now()}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
      });
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (isLoading) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-white p-8 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-8 ${className}`}>
        <p className="text-red-600">Failed to load geographic data</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Backer Geographic Distribution</h2>
          <p className="text-sm text-gray-600 mt-1">
            {data?.totalBackers.toLocaleString()} backers from {data?.data.length} countries
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportAsSVG}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export SVG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAsPNG}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export PNG
          </Button>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-gray-600">Total Backers</p>
          <p className="text-2xl font-bold text-purple-600">
            {data?.totalBackers.toLocaleString()}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-gray-600">Total Pledged</p>
          <p className="text-2xl font-bold text-purple-600">
            ${data?.totalAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-gray-600">Countries</p>
          <p className="text-2xl font-bold text-purple-600">{data?.data.length}</p>
        </div>
      </div>

      {/* World Map */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 500"
          className="w-full h-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Simplified world map paths - major countries/regions */}
          {/* US */}
          <path
            d="M 100 150 L 250 130 L 280 160 L 260 220 L 150 240 Z"
            fill={getCountryColor("US")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("US", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />
          
          {/* Canada */}
          <path
            d="M 120 80 L 280 70 L 290 130 L 250 130 L 100 150 Z"
            fill={getCountryColor("CA")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("CA", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Mexico */}
          <path
            d="M 150 240 L 260 220 L 250 270 L 180 280 Z"
            fill={getCountryColor("MX")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("MX", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Brazil */}
          <path
            d="M 330 300 L 400 290 L 420 360 L 360 380 Z"
            fill={getCountryColor("BR")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("BR", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* UK */}
          <path
            d="M 480 120 L 500 115 L 505 140 L 485 145 Z"
            fill={getCountryColor("GB")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("GB", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* France */}
          <path
            d="M 500 145 L 530 140 L 535 170 L 505 175 Z"
            fill={getCountryColor("FR")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("FR", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Germany */}
          <path
            d="M 530 130 L 560 125 L 565 155 L 535 160 Z"
            fill={getCountryColor("DE")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("DE", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Switzerland */}
          <path
            d="M 530 160 L 545 158 L 547 172 L 532 174 Z"
            fill={getCountryColor("CH")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("CH", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Netherlands */}
          <path
            d="M 520 120 L 540 118 L 542 132 L 522 134 Z"
            fill={getCountryColor("NL")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("NL", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Sweden */}
          <path
            d="M 550 80 L 575 75 L 580 115 L 555 120 Z"
            fill={getCountryColor("SE")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("SE", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* India */}
          <path
            d="M 700 220 L 760 230 L 750 300 L 710 290 Z"
            fill={getCountryColor("IN")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("IN", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Japan */}
          <path
            d="M 850 180 L 880 175 L 885 220 L 855 225 Z"
            fill={getCountryColor("JP")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("JP", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* South Korea */}
          <path
            d="M 830 190 L 845 188 L 847 205 L 832 207 Z"
            fill={getCountryColor("KR")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("KR", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Singapore */}
          <path
            d="M 780 310 L 790 309 L 791 318 L 781 319 Z"
            fill={getCountryColor("SG")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("SG", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />

          {/* Australia */}
          <path
            d="M 820 350 L 920 340 L 935 410 L 835 420 Z"
            fill={getCountryColor("AU")}
            stroke="#fff"
            strokeWidth="1"
            onMouseMove={(e) => handleCountryHover("AU", e)}
            onMouseLeave={handleCountryLeave}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          />
        </svg>

        {/* Tooltip */}
        {hoveredCountry && (
          <div
            className="fixed z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg pointer-events-none"
            style={{
              left: `${tooltipPos.x + 10}px`,
              top: `${tooltipPos.y + 10}px`,
            }}
          >
            <p className="font-semibold mb-1">{hoveredCountry.countryName}</p>
            <p className="text-sm">
              <span className="text-gray-300">Backers:</span>{" "}
              <span className="font-medium">{hoveredCountry.backerCount.toLocaleString()}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-300">Total Pledged:</span>{" "}
              <span className="font-medium">
                ${hoveredCountry.pledgeAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </p>
            <p className="text-sm">
              <span className="text-gray-300">Avg. Pledge:</span>{" "}
              <span className="font-medium">
                ${hoveredCountry.averagePledge.toFixed(2)}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <span className="text-sm text-gray-600">Backer Density:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          <span className="text-xs text-gray-500">Low</span>
        </div>
        <div className="w-32 h-4 rounded" style={{
          background: "linear-gradient(to right, rgb(229, 231, 235), rgb(147, 51, 234))"
        }}></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">High</span>
          <div className="w-4 h-4 bg-purple-600 rounded"></div>
        </div>
      </div>

      {/* Top Countries List */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Top Countries by Backers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.data.slice(0, 10).map((country) => (
            <div key={country.countryCode} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: getCountryColor(country.countryCode) }}
                ></div>
                <span className="font-medium text-gray-900">{country.countryName}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {country.backerCount} backers
                </p>
                <p className="text-xs text-gray-600">
                  ${country.pledgeAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
