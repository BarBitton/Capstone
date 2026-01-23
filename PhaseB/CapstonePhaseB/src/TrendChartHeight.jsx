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
 * TrendChartHeight.jsx (short documentation)
 * -----------------------------------------
 * Chart component that displays the child's height trend over time.
 *
 * Purpose:
 * - Visualize height (cm) as the child grows
 * - Help identify slow or abnormal height progression
 *
 * Input:
 * - points: array of objects in the format:
 *   { ageMonths: number, heightCm: number }
 *
 * Behavior:
 * - Requires at least two data points
 * - Sorts points by age (months)
 * - Displays a line chart using Chart.js
 *
 * Note:
 * - This component is used in:
 *   - ChildDetailsScreen
 *   - AssessmentScreen (for existing children)
 */

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export default function TrendChartHeight({ points }) {
  // Not enough measurements to show a trend
  if (!points || points.length < 2) {
    return <p>Not enough data for height trend.</p>;
  }

  // Sort data chronologically
  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);

  // Chart data
  const data = {
    labels: sorted.map((p) => String(p.ageMonths)),
    datasets: [
      {
        label: "Height (cm)",
        data: sorted.map((p) => p.heightCm),
        tension: 0.25, // smooth curve
      },
    ],
  };

  // Chart display options
  const options = {
    responsive: true,
    plugins: {
      legend: { display: true },
    },
    scales: {
      x: { title: { display: true, text: "Age (months)" } },
      y: { title: { display: true, text: "Height (cm)" } },
    },
  };

  return <Line data={data} options={options} />;
}
