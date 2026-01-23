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
 * TrendChartWeight.jsx (short documentation)
 * -----------------------------------------
 * Chart component that displays the child's weight trend over time.
 *
 * Purpose:
 * - Visualize weight (kg) measurements across age
 * - Support detection of poor weight gain or growth faltering
 *
 * Input:
 * - points: array of objects in the format:
 *   { ageMonths: number, weightKg: number }
 *
 * Behavior:
 * - Requires at least two measurements
 * - Sorts data by age (months)
 * - Displays a smooth line chart using Chart.js
 *
 * Used in:
 * - AssessmentScreen (existing child)
 * - ChildDetailsScreen (history view)
 */

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export default function TrendChartWeight({ points }) {
  // At least two data points are needed for a trend
  if (!points || points.length < 2) {
    return <p>Not enough data for weight trend.</p>;
  }

  // Sort points by age to ensure correct timeline
  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);

  // Chart data configuration
  const data = {
    labels: sorted.map((p) => String(p.ageMonths)),
    datasets: [
      {
        label: "Weight (kg)",
        data: sorted.map((p) => p.weightKg),
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
      y: { title: { display: true, text: "Weight (kg)" } },
    },
  };

  return <Line data={data} options={options} />;
}
