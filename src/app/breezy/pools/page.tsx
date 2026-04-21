"use client";

import BreezyPositionRecordsBrowser from "@/app/breezy/_components/position-records-browser";

export default function BreezyPoolsPage() {
  return (
    <BreezyPositionRecordsBrowser
      recordType="pool"
      title="Pools"
      description="Connect to Breezy and browse your companies and candidate pools."
    />
  );
}
