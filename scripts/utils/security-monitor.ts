export class SecurityMonitor {
  private static readonly SUSPICIOUS_PATTERNS = [
    /<script/i, /javascript:/i, /on\w+\s*=/i,
    /eval\s*\(/i, /Function\s*\(/i,
    /__proto__/i, /constructor\s*\[/i,
    /<iframe/i, /<object/i, /<embed/i
  ];

  static scanInput(input: unknown, source: string): boolean {
    if (typeof input !== 'string') return true;
    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(input)) {
        this.reportIncident({ type: 'XSS_ATTACK', source, payload: input });
        return false;
      }
    }
    return true;
  }

  static verifyDataIntegrity(): boolean {
    // Hook for checking record bounds, date sequences
    // Detailed implementation will be filled during store integration
    return true;
  }

  static reportIncident(details: Record<string, unknown>): void {
    try {
      const sanitizedDetails = { ...details };
      if (typeof sanitizedDetails.payload === 'string' && sanitizedDetails.payload.length > 500) {
        sanitizedDetails.payload = sanitizedDetails.payload.slice(0, 500) + '...[TRUNCATED]';
      }
      let incidents: unknown[] = [];
      try {
        const stored = localStorage.getItem('security_incidents');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            incidents = parsed;
          }
        }
      } catch {
        incidents = [];
      }
      // Ring buffer: keep at most 49 previous incidents so the new incident makes 50 max
      incidents = incidents.slice(-49);
      incidents.push({ timestamp: new Date().toISOString(), ...sanitizedDetails });
      localStorage.setItem('security_incidents', JSON.stringify(incidents));
    } catch {
      console.error('Failed to write security incident to local storage');
    }
    console.error('[SECURITY INCIDENT]', details);
  }

  static sanitizeHtml(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }
}
