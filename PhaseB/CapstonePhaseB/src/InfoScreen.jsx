// src/InfoScreen.jsx
import React from "react";

const InfoScreen = ({ onBack }) => {
  return (
    <div className="screen">
      <h2 className="screen-title">Failure to Thrive (FTT)</h2>
      <div className="info-text">
        <p>
          FTT (Failure to Thrive) is a medical term describing a condition in
          which a child does not grow as expected for their age and sex,
          typically when their weight or height falls below the 5th percentile
          on growth charts.
        </p>
        <p>
          The condition may result from nutritional, medical, environmental or
          psychosocial factors and requires early evaluation and diagnosis. If
          left untreated, FTT may lead to long-term developmental delays,
          weakened immunity and cognitive impairments.
        </p>
        <p>
          Early detection and a multidisciplinary approach to diagnosis and
          treatment are crucial for improving health outcomes in affected
          children.
        </p>
      </div>

      <button className="btn-secondary" onClick={onBack}>
        Back
      </button>
    </div>
  );
};

export default InfoScreen;
