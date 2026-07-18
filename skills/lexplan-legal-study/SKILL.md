# LexPlan Legal Study Skill

Use this skill when working on the LexPlan legal study planning-card Agent. The business Agent lives outside Hypha and uses Hypha as an external framework dependency.

Core workflow:
1. Import Bilibili course metadata through preview/confirm.
2. Process textbook PDF OCR into chapters, slices, and cards.
3. Confirm course-chapter mappings and unlock cards after episode completion.
4. Run FSRS review pressure and Agent proposal planning with human-reviewed writes.

Keep legal-study business logic, prompts, pages, API routes, database schemas, and fixtures in LexPlan. Only cross-business framework abstractions may be proposed back to Hypha.