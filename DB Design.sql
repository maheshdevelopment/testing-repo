/*
# Job Matching Platform Database Schema (PostgreSQL)

Updated for local PostgreSQL setup (pgAdmin)
- Uses gen_random_uuid() for UUIDs (pgcrypto)
- Compatible with PostgreSQL 12+
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types
CREATE TYPE user_role AS ENUM ('candidate', 'employer', 'admin');
CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'interview_scheduled', 'selected', 'rejected');
CREATE TYPE job_status AS ENUM ('active', 'paused', 'closed');
CREATE TYPE kyc_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE notification_type AS ENUM ('job_match', 'application_update', 'interview_scheduled', 'system');
CREATE TYPE job_type AS ENUM ('full_time', 'part_time', 'contract', 'temporary');
CREATE TYPE experience_level AS ENUM ('fresher', 'experienced', 'senior');

-- Users table (main authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NULL,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NULL,
  role user_role NOT NULL DEFAULT 'candidate',
  preferred_language VARCHAR(10) DEFAULT 'eng',
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  otp VARCHAR(6),
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Candidate profiles
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Employer profiles
CREATE TABLE IF NOT EXISTS employer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Skills master table
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name)
);

-- Languages master table
CREATE TABLE IF NOT EXISTS languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code)
);

-- Locations master table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  pincode VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Job skills mapping
CREATE TABLE IF NOT EXISTS job_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT true,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, skill_id)
);

-- User skills mapping
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  years_of_experience INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, skill_id)
);

-- User languages mapping
CREATE TABLE IF NOT EXISTS user_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
  proficiency_level VARCHAR(50) DEFAULT 'basic',
  is_native BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, language_id)
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- KYC Verification table
CREATE TABLE IF NOT EXISTS kyc_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  aadhaar_number VARCHAR(12),
  verification_status kyc_status DEFAULT 'pending',
  verified_name VARCHAR(255),
  verified_dob DATE,
  verified_gender VARCHAR(20),
  verification_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Job matches table (AI matching results)
CREATE TABLE IF NOT EXISTS job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  match_score DECIMAL(5,2) CHECK (match_score >= 0 AND match_score <= 100),
  matching_factors JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, candidate_id)
);

-- Indexes
CREATE INDEX idx_users_mobile ON users(mobile);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_candidate_profiles_user_id ON candidate_profiles(user_id);
CREATE INDEX idx_candidate_profiles_location ON candidate_profiles(current_location);
CREATE INDEX idx_employer_profiles_user_id ON employer_profiles(user_id);
CREATE INDEX idx_employer_profiles_company_name ON employer_profiles(company_name);
CREATE INDEX idx_jobs_employer_id ON jobs(employer_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_location ON jobs(city, state);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_candidate_id ON applications(candidate_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_job_matches_candidate_id ON job_matches(candidate_id);
CREATE INDEX idx_job_matches_job_id ON job_matches(job_id);
CREATE INDEX idx_job_matches_score ON job_matches(match_score);

-- Full text search indexes
CREATE INDEX idx_jobs_search ON jobs USING gin(to_tsvector('english', title || ' ' || description));
CREATE INDEX idx_skills_search ON skills USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Sample data (safe for reruns)
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


-- auth logs table
CREATE TABLE IF NOT EXISTS auth_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  mobile VARCHAR(15),
  user_role VARCHAR(50),
  step VARCHAR(100),
  status VARCHAR(20), -- success, failed, warning
  message TEXT,
  error_stack TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_logs_mobile ON auth_logs(mobile);
CREATE INDEX idx_auth_logs_role ON auth_logs(user_role);
CREATE INDEX idx_auth_logs_created_at ON auth_logs(created_at DESC);

ALTER TABLE auth_logs
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100),
ADD COLUMN IF NOT EXISTS device_info TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_logs_ip ON auth_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_logs_device ON auth_logs(device_info);
