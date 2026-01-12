import React from 'react';
import { Info } from 'lucide-react';

interface BurnoutFactor {
  text: string;
  points: number | null;
  subBullets: string[];
}

interface BurnoutFactorsV0Props {
  ocbReasoning: string[];
}

export function BurnoutFactorsV0({ ocbReasoning }: BurnoutFactorsV0Props) {
  // Parse factors from OCB reasoning
  let currentSection = 'personal';
  let personalPoints = 0;
  let workRelatedPoints = 0;
  let personalFactors: BurnoutFactor[] = [];
  let workRelatedFactors: BurnoutFactor[] = [];
  let currentFactors = personalFactors;

  ocbReasoning.slice(1).forEach((reason: string) => {
    const cleanReason = reason.replace(/^[\s]*[•·\-*]\s*/, '').trim();
    if (cleanReason === 'PERSONAL:') {
      currentSection = 'personal';
      currentFactors = personalFactors;
    } else if (cleanReason === 'WORK-RELATED:') {
      currentSection = 'work';
      currentFactors = workRelatedFactors;
    } else if (!cleanReason.endsWith(':') && cleanReason.length > 0) {
      const isSubBullet = reason.match(/^\s{2,}[•·\-*]\s*/);

      if (!isSubBullet) {
        // Main factor
        const pointsMatch = cleanReason.match(/\(([0-9.]+) points?\)/);
        const points = pointsMatch ? parseFloat(pointsMatch[1]) : null;
        const factorText = points ? cleanReason.replace(/\s*\([0-9.]+ points?\)/, '') : cleanReason;

        const factor: BurnoutFactor = {
          text: factorText,
          points: points,
          subBullets: []
        };

        currentFactors.push(factor);

        if (points) {
          if (currentSection === 'personal') personalPoints += points;
          else if (currentSection === 'work') workRelatedPoints += points;
        }
      } else {
        // Sub-bullet
        if (currentFactors.length > 0) {
          currentFactors[currentFactors.length - 1].subBullets.push(cleanReason);
        }
      }
    }
  });

  return (
    <div className="space-y-8" style={{ all: 'unset', display: 'block', fontFamily: 'inherit' }}>
      {/* PERSONAL Section */}
      {personalFactors.length > 0 && (
        <>
          <div className="bg-green-50 rounded-lg px-6 py-4 border border-green-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-green-700 uppercase">Personal</h3>
                <div className="relative group">
                  <Info className="w-4 h-4 text-green-500 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="font-semibold mb-1">Personal Burnout Factors</div>
                    <div>Individual-level stress indicators including incident frequency, after-hours work patterns, sleep disruption, and personal workload intensity</div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8" style={{ fontWeight: 'normal !important' }}>
            {personalFactors.map((factor, idx) => (
              <div key={idx} style={{ fontWeight: 'normal !important' }}>
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-lg text-neutral-900 flex-1 pr-4" style={{ fontWeight: 'normal !important' }}>
                    {factor.text}
                  </h4>
                  {factor.points && (
                    <div className="text-right">
                      <span className="text-xl text-neutral-900" style={{ fontWeight: '700 !important' }}>
                        {factor.points.toFixed(1)}
                      </span>
                      <span className="text-sm text-neutral-500 ml-1" style={{ fontWeight: '400 !important' }}>points</span>
                    </div>
                  )}
                </div>
                {factor.subBullets.length > 0 && (
                  <div className="space-y-1 ml-6">
                    {factor.subBullets.map((bullet, bulletIdx) => (
                      <div key={bulletIdx} className="flex items-start gap-2">
                        <div
                          className="rounded-full flex-shrink-0"
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: '#9CA3AF',
                            marginTop: '8px',
                            opacity: '0.6'
                          }}
                        ></div>
                        <span
                          className="text-xs block"
                          style={{
                            fontWeight: 'normal !important',
                            fontFamily: 'inherit',
                            lineHeight: '1.4',
                            color: '#9CA3AF !important',
                            display: 'block'
                          }}
                        >
                          {bullet}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Divider */}
      {personalFactors.length > 0 && workRelatedFactors.length > 0 && (
        <div className="w-full" style={{ height: '1px', backgroundColor: '#D1D5DB', margin: '32px 0' }}></div>
      )}

      {/* WORK-RELATED Section */}
      {workRelatedFactors.length > 0 && (
        <>
          <div className="bg-blue-50 rounded-lg px-6 py-4 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-blue-700 uppercase">Work-Related</h3>
                <div className="relative group">
                  <Info className="w-4 h-4 text-blue-500 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="font-semibold mb-1">Work-Related Burnout Factors</div>
                    <div>Job-specific stress indicators including incident response patterns, severity-weighted workload, code activity timing, and work-life boundary violations</div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8" style={{ fontWeight: 'normal !important' }}>
            {workRelatedFactors.map((factor, idx) => (
              <div key={idx} style={{ fontWeight: 'normal !important' }}>
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-lg text-neutral-900 flex-1 pr-4" style={{ fontWeight: 'normal !important' }}>
                    {factor.text}
                  </h4>
                  {factor.points && (
                    <div className="text-right">
                      <span className="text-xl text-neutral-900" style={{ fontWeight: '700 !important' }}>
                        {factor.points.toFixed(1)}
                      </span>
                      <span className="text-sm text-neutral-500 ml-1" style={{ fontWeight: '400 !important' }}>points</span>
                    </div>
                  )}
                </div>
                {factor.subBullets.length > 0 && (
                  <div className="space-y-1 ml-6">
                    {factor.subBullets.map((bullet, bulletIdx) => (
                      <div key={bulletIdx} className="flex items-start gap-2">
                        <div
                          className="rounded-full flex-shrink-0"
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: '#9CA3AF',
                            marginTop: '8px',
                            opacity: '0.6'
                          }}
                        ></div>
                        <span
                          className="text-xs block"
                          style={{
                            fontWeight: 'normal !important',
                            fontFamily: 'inherit',
                            lineHeight: '1.4',
                            color: '#9CA3AF !important',
                            display: 'block'
                          }}
                        >
                          {bullet}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}