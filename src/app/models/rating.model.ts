export interface RatingCriterion {
    percent: number;
    description: string;
}

export interface DiagnosticCode {
    code: string;
    condition: string;
    system: string;      // Formerly 'grouping', e.g., "Musculoskeletal System"
    subSystem?: string;  // e.g., "The Knee and Leg"
    criteria: RatingCriterion[];
    notes?: string;
    link?: string; // Deep link to 38CFR
}

export interface SystemGrouping {
    name: string;
    subSystems: string[];
}
