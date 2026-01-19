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
  if (!points || points.length < 2) {
    return <p>Not enough data for a trend chart yet.</p>;
  }

  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);
  const labels = sorted.map((p) => String(p.ageMonths));

  const hasWeight = sorted.some((p) => Number.isFinite(p.weightKg));
  const hasHeight = sorted.some((p) => Number.isFinite(p.heightCm));

  if (!hasWeight && !hasHeight) {
    return <p>Not enough data for a trend chart yet.</p>;
  }

  const datasets = [];

  if (hasWeight) {
    datasets.push({
      label: "Weight (kg)",
      data: sorted.map((p) => (Number.isFinite(p.weightKg) ? p.weightKg : null)),
      tension: 0.25,
    });
  }

  if (hasHeight) {
    datasets.push({
      label: "Height (cm)",
      data: sorted.map((p) => (Number.isFinite(p.heightCm) ? p.heightCm : null)),
      tension: 0.25,
    });
  }

  const data = { labels, datasets };

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
