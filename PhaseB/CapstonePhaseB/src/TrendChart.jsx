import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

/**
 * TrendChart.jsx (short documentation)
 * -----------------------------------
 * Generic line chart component for showing growth trends over time.
 *
 * Input:
 * - points: array of objects like:
 *   { ageMonths: number, weightKg?: number, heightCm?: number }
 *
 * Behavior:
 * - Requires at least 2 points to draw a trend.
 * - Sorts points by ageMonths.
 * - Automatically draws:
 *   - Weight line if weightKg exists in the data
 *   - Height line if heightCm exists in the data
 *
 * Library:
 * - Uses Chart.js via react-chartjs-2.
 * - ChartJS.register(...) is required once to enable chart features.
 */

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export default function TrendChart({ points }) {
  // points: [{ ageMonths: number, weightKg?: number, heightCm?: number }]

  // Need at least 2 points for a meaningful trend line
  if (!points || points.length < 2) {
    return <p>Not enough data for a trend chart yet.</p>;
  }

  // Sort by age so the chart is displayed left-to-right correctly
  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);

  // X-axis labels are age in months
  const labels = sorted.map((p) => String(p.ageMonths));

  // Decide which lines can be drawn based on available data
  const hasWeight = sorted.some((p) => Number.isFinite(p.weightKg));
  const hasHeight = sorted.some((p) => Number.isFinite(p.heightCm));

  if (!hasWeight && !hasHeight) {
    return <p>Not enough data for a trend chart yet.</p>;
  }

  const datasets = [];

  // Weight dataset (if available)
  if (hasWeight) {
    datasets.push({
      label: "Weight (kg)",
      data: sorted.map((p) => (Number.isFinite(p.weightKg) ? p.weightKg : null)),
      tension: 0.25, // makes the line slightly smooth
    });
  }

  // Height dataset (if available)
  if (hasHeight) {
    datasets.push({
      label: "Height (cm)",
      data: sorted.map((p) => (Number.isFinite(p.heightCm) ? p.heightCm : null)),
      tension: 0.25,
    });
  }

  // Chart data object used by react-chartjs-2
  const data = { labels, datasets };

  // Basic chart configuration
  const options = {
    responsive: true,
    plugins: {
      legend: { display: true },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        title: { display: true, text: "Age (months)" },
      },
      y: {
        title: { display: true, text: "Measurements" },
      },
    },
  };

  return <Line data={data} options={options} />;
}
