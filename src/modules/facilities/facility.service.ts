import { prisma } from '../../infrastructure/database/prisma.js';
import { CreateFacilityInput, MatchFacilityQuery } from './facility.schema.js';
import { FacilityTier, TriageCategory, Facility } from '@prisma/client';
import { NotFoundError } from '../../common/errors/http-errors.js';

export interface MatchedFacilityResult {
  facility: Facility;
  distanceKm: number;
  matchScore: number;
  reasons: string[];
}

export class FacilityService {
  // Haversine formula calculation in kilometers
  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  public async createFacility(input: CreateFacilityInput) {
    return prisma.facility.create({
      data: input,
    });
  }

  public async listFacilities() {
    return prisma.facility.findMany({
      where: { operationalStatus: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  public async getFacilityById(id: string) {
    const facility = await prisma.facility.findUnique({
      where: { id },
      include: { workers: true },
    });

    if (!facility) {
      throw new NotFoundError(`Facility with ID '${id}' not found`);
    }

    return facility;
  }

  public async matchFacilities(query: MatchFacilityQuery): Promise<MatchedFacilityResult[]> {
    const allFacilities = await prisma.facility.findMany({
      where: { operationalStatus: 'ACTIVE' },
    });

    const results: MatchedFacilityResult[] = [];

    for (const f of allFacilities) {
      const distance = this.calculateDistance(query.lat, query.lng, f.latitude, f.longitude);

      if (distance > query.maxDistanceKm) {
        continue;
      }

      let matchScore = 100 - distance; // Base score declines with distance
      const reasons: string[] = [`Distance: ${distance} km`];

      // 1. Specialty matching
      if (query.specialty) {
        const hasSpecialty = f.specialties.some(
          (s) => s.toLowerCase() === query.specialty?.toLowerCase() || s.toLowerCase().includes(query.specialty!.toLowerCase())
        );

        if (hasSpecialty) {
          matchScore += 40;
          reasons.push(`Specialty match: ${query.specialty}`);
        } else {
          // If a specialty was explicitly requested but facility lacks it, penalize
          matchScore -= 30;
        }
      }

      // 2. Urgency & Tier matching
      if (query.urgency === TriageCategory.EMERGENCY_RED) {
        if (f.hasEmergencyUnit) {
          matchScore += 30;
          reasons.push('Dedicated 24/7 Emergency Unit available');
        }
        if (f.tier === FacilityTier.DISTRICT_HOSPITAL || f.tier === FacilityTier.CHC) {
          matchScore += 25;
          reasons.push(`Tertiary / Secondary Care Facility (${f.tier})`);
        }
        if (f.hasAmbulance) {
          matchScore += 10;
          reasons.push('Ambulance stationed on site');
        }
      } else if (query.urgency === TriageCategory.URGENT_YELLOW) {
        if (f.tier === FacilityTier.CHC || f.tier === FacilityTier.PHC) {
          matchScore += 20;
          reasons.push(`Optimal care tier for urgency (${f.tier})`);
        }
      }

      // 3. Bed availability bonus
      if (f.availableBeds > 0) {
        matchScore += 15;
        reasons.push(`${f.availableBeds} beds currently available`);
      }

      results.push({
        facility: f,
        distanceKm: distance,
        matchScore: Number(matchScore.toFixed(1)),
        reasons,
      });
    }

    // Sort descending by matchScore (best match first)
    results.sort((a, b) => b.matchScore - a.matchScore);

    return results.slice(0, query.limit);
  }
}
