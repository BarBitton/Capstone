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

export default function TrendChartWeight({ points }) {
  if (!points || points.length < 2) {
    return <p>Not enough data for weight trend.</p>;
  }

  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);

  const data = {
    labels: sorted.map((p) => String(p.ageMonths)),
    datasets: [
      {
        label: "Weight (kg)",
        data: sorted.map((p) => p.weightKg),
        tension: 0.25,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: {
      x: { title: { display: true, text: "Age (months)" } },
      y: { title: { display: true, text: "Weight (kg)" } },
    },
  };

  return <Line data={data} options={options} />;
}