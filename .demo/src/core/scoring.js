export function riskLevelFor(score) {
    return score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
}
/** Adds up the findings of all rules into one score between 0 and 100. */
export function combine(findings) {
    const total = findings.reduce((sum, finding) => sum + finding.points, 0);
    const riskScore = Math.min(100, Math.max(0, total));
    return {
        riskScore,
        riskLevel: riskLevelFor(riskScore),
        reasons: findings.map((finding) => finding.reason),
        findings,
    };
}
