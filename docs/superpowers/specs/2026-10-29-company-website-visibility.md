# Company website visibility

Approved behavior: a company “Show all JDs on website” setting includes existing and future published JDs. Effective website visibility is individual selection OR company selection. Disabling the company setting preserves individual selections. Each JD retains its opening type and the existing website section mapping.

Approach: store a separate boolean in company metadata and resolve it when public jobs are read. Do not bulk-write JD overrides: that would lose selection provenance and omit future JDs. Reuse existing company resolution, tenant authorization, and cache invalidation. Apply the setting to duplicate company rows represented by one company card. No schema change or production publication is required.

UI: an immediately saved switch inside the expanded company card, with explanatory text that new JDs are included and individual selections survive disabling. Keep current published/position eligibility rules and opening-type inheritance.
