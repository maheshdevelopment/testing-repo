/*
# Job Matching Platform Database Schema

## Overview
Complete PostgreSQL database schema for the job matching platform supporting:
1. Multi-role user system (candidates, employers, admins)
2. AI-powered resume creation and job matching
3. Multi-language support
4. Aadhaar-based KYC verification
5. Job posting and application management

## Tables Created
1. **users** - Main user authentication and basic info
2. **candidate_profiles** - Detailed candidate information
3. **employer_profiles** - Company/employer details
4. **jobs** - Job postings with requirements
5. **applications** - Job applications and status tracking
6. **skills** - Master skills list
7. **languages** - Supported languages
8. **locations** - Indian states and cities
9. **user_skills** - Candidate skills mapping
10. **user_languages** - User language preferences
11. **job_skills** - Job skill requirements
12. **kyc_verification** - Aadhaar verification status
13. **notifications** - System notifications
14. **job_matches** - AI matching results

## Security
- RLS enabled on all tables
- Proper indexing for performance
- Data privacy compliance for Aadhaar handling
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('candidate', 'employer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'interview_scheduled', 'selected', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('active', 'paused', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('job_match', 'application_update', 'interview_scheduled', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('full_time', 'part_time', 'contract', 'temporary');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE experience_level AS ENUM ('fresher', 'experienced', 'senior');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Users table (main authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role user_role NOT NULL DEFAULT 'candidate',
  preferred_language VARCHAR(10) DEFAULT 'en',
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  otp VARCHAR(6),
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Candidate profiles
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  age INTEGER CHECK (age >= 18 AND age <= 100),
  gender VARCHAR(20),
  photo_url VARCHAR(500),
  education VARCHAR(100),
  work_experience TEXT,
  location_preference VARCHAR(100),
  current_location VARCHAR(100),
  aadhaar_number VARCHAR(12),
  resume_url VARCHAR(500),
  bio TEXT,
  availability VARCHAR(50) DEFAULT 'immediate',
  expected_salary_min INTEGER,
  expected_salary_max INTEGER,
  job_preferences JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own candidate profile"
  ON candidate_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Employers can read candidate profiles"
  ON candidate_profiles FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'employer'));

CREATE POLICY "Users can insert own candidate profile"
  ON candidate_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own candidate profile"
  ON candidate_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Employer profiles
CREATE TABLE IF NOT EXISTS employer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  company_description TEXT,
  industry VARCHAR(100),
  company_size VARCHAR(50),
  website_url VARCHAR(255),
  gst_number VARCHAR(20),
  pan_number VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  contact_person VARCHAR(255),
  contact_designation VARCHAR(100),
  logo_url VARCHAR(500),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own employer profile"
  ON employer_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Candidates can read verified employer profiles"
  ON employer_profiles FOR SELECT
  TO authenticated
  USING (is_verified = true);

CREATE POLICY "Users can insert own employer profile"
  ON employer_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own employer profile"
  ON employer_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Skills master table
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active skills"
  ON skills FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Languages master table
CREATE TABLE IF NOT EXISTS languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE languages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active languages"
  ON languages FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Locations master table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  pincode VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active locations"
  ON locations FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employer_id UUID REFERENCES employer_profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT,
  job_type job_type DEFAULT 'full_time',
  experience_level experience_level DEFAULT 'fresher',
  salary_min INTEGER,
  salary_max INTEGER,
  location VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  pincode VARCHAR(10),
  shift_timing VARCHAR(100),
  benefits TEXT,
  contact_details JSONB,
  status job_status DEFAULT 'active',
  posted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "Employers can insert their own jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM employer_profiles WHERE employer_profiles.id = employer_id AND employer_profiles.user_id = auth.uid()));

CREATE POLICY "Employers can update their own jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM employer_profiles WHERE employer_profiles.id = employer_id AND employer_profiles.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM employer_profiles WHERE employer_profiles.id = employer_id AND employer_profiles.user_id = auth.uid()));

CREATE POLICY "Employers can delete their own jobs"
  ON jobs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM employer_profiles WHERE employer_profiles.id = employer_id AND employer_profiles.user_id = auth.uid()));

-- Job skills mapping
CREATE TABLE IF NOT EXISTS job_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT true,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, skill_id)
);

ALTER TABLE job_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read job skills"
  ON job_skills FOR SELECT
  TO authenticated
  USING (true);

-- User skills mapping
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  years_of_experience INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, skill_id)
);

ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own skills"
  ON user_skills FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Employers can read candidate skills"
  ON user_skills FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'employer'));

CREATE POLICY "Users can insert own skills"
  ON user_skills FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own skills"
  ON user_skills FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own skills"
  ON user_skills FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- User languages mapping
CREATE TABLE IF NOT EXISTS user_languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  is_native BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, language_id)
);

ALTER TABLE user_languages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own languages"
  ON user_languages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own languages"
  ON user_languages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  status application_status DEFAULT 'applied',
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  shortlisted_at TIMESTAMP WITH TIME ZONE,
  interview_scheduled_at TIMESTAMP WITH TIME ZONE,
  interview_notes TEXT,
  employer_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, candidate_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can read own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM candidate_profiles WHERE candidate_profiles.id = candidate_id AND candidate_profiles.user_id = auth.uid()));

CREATE POLICY "Employers can read applications for their jobs"
  ON applications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM jobs 
    JOIN employer_profiles ON jobs.employer_id = employer_profiles.id 
    WHERE jobs.id = job_id AND employer_profiles.user_id = auth.uid()
  ));

CREATE POLICY "Candidates can insert own applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM candidate_profiles WHERE candidate_profiles.id = candidate_id AND candidate_profiles.user_id = auth.uid()));

CREATE POLICY "Employers can update applications for their jobs"
  ON applications FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM jobs 
    JOIN employer_profiles ON jobs.employer_id = employer_profiles.id 
    WHERE jobs.id = job_id AND employer_profiles.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs 
    JOIN employer_profiles ON jobs.employer_id = employer_profiles.id 
    WHERE jobs.id = job_id AND employer_profiles.user_id = auth.uid()
  ));

-- KYC Verification table
CREATE TABLE IF NOT EXISTS kyc_verification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  aadhaar_number VARCHAR(12),
  verification_status kyc_status DEFAULT 'pending',
  verified_name VARCHAR(255),
  verified_dob DATE,
  verified_gender VARCHAR(20),
  verification_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE kyc_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kyc verification"
  ON kyc_verification FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own kyc verification"
  ON kyc_verification FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Job matches table (AI matching results)
CREATE TABLE IF NOT EXISTS job_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  match_score DECIMAL(5,2) CHECK (match_score >= 0 AND match_score <= 100),
  matching_factors JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, candidate_id)
);

ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can read own job matches"
  ON job_matches FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM candidate_profiles WHERE candidate_profiles.id = candidate_id AND candidate_profiles.user_id = auth.uid()));

CREATE POLICY "Employers can read matches for their jobs"
  ON job_matches FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM jobs 
    JOIN employer_profiles ON jobs.employer_id = employer_profiles.id 
    WHERE jobs.id = job_id AND employer_profiles.user_id = auth.uid()
  ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_user_id ON candidate_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_location ON candidate_profiles(current_location);

CREATE INDEX IF NOT EXISTS idx_employer_profiles_user_id ON employer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_company_name ON employer_profiles(company_name);

CREATE INDEX IF NOT EXISTS idx_jobs_employer_id ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(city, state);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_matches_candidate_id ON job_matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_job_id ON job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(match_score DESC);

-- Full text search indexes
CREATE INDEX IF NOT EXISTS idx_jobs_search ON jobs USING gin(to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_skills_search ON skills USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Insert sample data
INSERT INTO languages (code, name, native_name) VALUES
('en', 'English', 'English'),
('hi', 'Hindi', 'हिंदी'),
('te', 'Telugu', 'తెలుగు'),
('ta', 'Tamil', 'தமிழ்'),
('bn', 'Bengali', 'বাংলা'),
('mr', 'Marathi', 'मराठी'),
('kn', 'Kannada', 'ಕನ್ನಡ'),
('gu', 'Gujarati', 'ગુજરાતી'),
('or', 'Odia', 'ଓଡ଼ିଆ'),
('pa', 'Punjabi', 'ਪੰਜਾਬੀ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO skills (name, category) VALUES
('Driving', 'Transportation'),
('Cooking', 'Food Service'),
('Security Guard', 'Security'),
('Cleaning', 'Maintenance'),
('Construction', 'Construction'),
('Welding', 'Technical'),
('Electrical Work', 'Technical'),
('Plumbing', 'Technical'),
('Delivery', 'Logistics'),
('Customer Service', 'Service'),
('Data Entry', 'Administrative'),
('Sales', 'Sales'),
('Nursing', 'Healthcare'),
('Teaching', 'Education'),
('Tailoring', 'Crafts')
ON CONFLICT (name) DO NOTHING;

INSERT INTO locations (state, city) VALUES
('Delhi', 'New Delhi'),
('Maharashtra', 'Mumbai'),
('Maharashtra', 'Pune'),
('Karnataka', 'Bangalore'),
('Tamil Nadu', 'Chennai'),
('Telangana', 'Hyderabad'),
('West Bengal', 'Kolkata'),
('Gujarat', 'Ahmedabad'),
('Rajasthan', 'Jaipur'),
('Punjab', 'Chandigarh')
ON CONFLICT DO NOTHING;