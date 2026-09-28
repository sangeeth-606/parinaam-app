import type { OfficerRole } from '../contracts/officer-roles.ts';

export interface OfficerRosterEntry {
  username: string;
  officer_code: string;
  display_name: string;
  rank: string;
  role: OfficerRole;
  department: string;
  unit: string;
  region_code: string;
}

/**
 * 10 synthetic officers across three real departments and four regions.
 * Preserves HC-4412, SI-5521, INSP-1044, IC-9007 attribution to existing demo dataset.
 * Contains no credentials/passwords.
 */
export const OFFICER_ROSTER: readonly OfficerRosterEntry[] = [
  {
    username: 'admin',
    officer_code: 'OFFICER-ADMIN',
    display_name: 'Anil Kumar Verma',
    rank: 'Deputy Commissioner',
    role: 'ADMIN',
    department: 'NCB',
    unit: 'NCB Headquarters, New Delhi',
    region_code: 'DZU',
  },
  {
    username: 'supervisor',
    officer_code: 'OFFICER-SUPERVISOR',
    display_name: 'Farah Nasim Qureshi',
    rank: 'Joint Director',
    role: 'SUPERVISOR',
    department: 'NCB',
    unit: 'NCB Zonal Office, Mumbai',
    region_code: 'MZU',
  },
  {
    username: 'iyer',
    officer_code: 'AC-7788',
    display_name: 'Meenakshi Iyer',
    rank: 'Assistant Commissioner',
    role: 'SUPERVISOR',
    department: 'NCB',
    unit: 'NCB Zonal Office, Bengaluru',
    region_code: 'BZU',
  },
  {
    username: 'sharma',
    officer_code: 'HC-4412',
    display_name: 'Baljinder Singh Sidhu',
    rank: 'Head Constable',
    role: 'SENIOR',
    department: 'NCB',
    unit: 'NCB Zonal Office, Delhi',
    region_code: 'DZU',
  },
  {
    username: 'mukherjee',
    officer_code: 'SI-5521',
    display_name: 'Priya Mukherjee',
    rank: 'Sub-Inspector (Narcotics)',
    role: 'SENIOR',
    department: 'RAILWAYS',
    unit: 'Kolkata Railway Parcel Intelligence Unit',
    region_code: 'KZU',
  },
  {
    username: 'rao',
    officer_code: 'INSP-1044',
    display_name: 'Venkateswara Rao',
    rank: 'Inspector',
    role: 'SENIOR',
    department: 'NCB',
    unit: 'NCB Intelligence Bureau, Bengaluru',
    region_code: 'BZU',
  },
  {
    username: 'kapoor',
    officer_code: 'DSP-3310',
    display_name: 'Ranjeet Singh Kapoor',
    rank: 'Deputy Superintendent of Police',
    role: 'SENIOR',
    department: 'STATE_POLICE',
    unit: 'Delhi Police Crime Branch, Central District',
    region_code: 'DZU',
  },
  {
    username: 'patel',
    officer_code: 'IC-2264',
    display_name: 'Hetalben Patel',
    rank: 'Inspector of Customs',
    role: 'SENIOR',
    department: 'CUSTOMS',
    unit: 'Air Cargo Intelligence Cell, Delhi',
    region_code: 'DZU',
  },
  {
    username: 'gill',
    officer_code: 'IC-9007',
    display_name: 'Sukhdev Singh Gill',
    rank: 'Intelligence Officer',
    role: 'JUNIOR',
    department: 'NCB',
    unit: 'NCB Zonal Office, Delhi',
    region_code: 'DZU',
  },
  {
    username: 'reddy',
    officer_code: 'JM-5501',
    display_name: 'Ananya Reddy',
    rank: 'Judicial Magistrate',
    role: 'JUDICIARY',
    department: 'JUDICIARY',
    unit: 'Fast Track Court, Hyderabad',
    region_code: 'HYD',
  },
] as const;
