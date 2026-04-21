"use client";

import BreezyPositionRecordsBrowser from "@/app/breezy/_components/position-records-browser";

export default function BreezyPositionsPage() {
  return (
    <BreezyPositionRecordsBrowser
      recordType="position"
      title="Positions"
      description="Connect to Breezy and browse your companies and job openings."
    />
  );
}
