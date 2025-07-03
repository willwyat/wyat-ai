#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeartRateData {
    pub timestamp: String,
    pub bpm: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VO2Data {
    pub date: String,
    pub vo2_max: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StressData {
    pub day: String,
    pub score: Option<u8>,
}
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SleepData {
    pub date: String,
    pub sleep_score: Option<u8>,
    pub total_sleep_minutes: u32,
    pub rem_sleep_minutes: u32,
    pub deep_sleep_minutes: u32,
    pub light_sleep_minutes: u32,
    pub time_in_bed_minutes: u32,
    pub efficiency: Option<u8>,
    pub average_hr: Option<f32>,
    pub lowest_hr: Option<f32>,
    pub hrv: Option<f32>,
}

pub async fn fetch_oura_sleep_data(
    start_date: &str,
    end_date: &str,
) -> Result<Vec<SleepData>, String> {
    let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
    let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
    let base_url = base_url.trim_end_matches('/').to_string();

    let url = format!(
        "{}/usercollection/sleep?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraSleepResponse {
        data: Vec<OuraSleepRecord>,
    }

    #[derive(Deserialize)]
    struct OuraSleepRecord {
        day: String,
        score: Option<u8>,
        total_sleep_duration: u32,
        rem_sleep_duration: Option<u32>,
        deep_sleep_duration: Option<u32>,
        light_sleep_duration: Option<u32>,
        time_in_bed: Option<u32>,
        efficiency: Option<u8>,
        average_hr: Option<f32>,
        lowest_hr: Option<f32>,
        rmssd: Option<f32>,
    }

    let response: OuraSleepResponse = res.json().await.map_err(|e| e.to_string())?;
    let results = response
        .data
        .into_iter()
        .map(|record| SleepData {
            date: record.day,
            sleep_score: record.score,
            total_sleep_minutes: record.total_sleep_duration / 60,
            rem_sleep_minutes: record.rem_sleep_duration.unwrap_or(0) / 60,
            deep_sleep_minutes: record.deep_sleep_duration.unwrap_or(0) / 60,
            light_sleep_minutes: record.light_sleep_duration.unwrap_or(0) / 60,
            time_in_bed_minutes: record.time_in_bed.unwrap_or(0) / 60,
            efficiency: record.efficiency,
            average_hr: record.average_hr,
            lowest_hr: record.lowest_hr,
            hrv: record.rmssd,
        })
        .collect();

    Ok(results)
}

use std::collections::HashMap;
use std::path::Path;
use tokio::fs;

pub async fn write_sleep_summary_to_file(sleep_data: &[SleepData]) -> Result<(), String> {
    let path = Path::new("vitals/sleep.json");

    // Load existing data if file exists
    let mut existing_data: Vec<SleepData> = if path.exists() {
        let content = fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Index by date
    let mut map: HashMap<String, SleepData> = existing_data
        .into_iter()
        .map(|entry| (entry.date.clone(), entry))
        .collect();

    // Insert/overwrite with new data
    for entry in sleep_data {
        map.insert(entry.date.clone(), entry.clone());
    }

    // Save merged results
    let merged: Vec<SleepData> = map.into_values().collect();
    let json = serde_json::to_string_pretty(&merged)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    fs::create_dir_all("vitals")
        .await
        .map_err(|e| format!("Failed to create vitals directory: {}", e))?;
    fs::write(path, json)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkoutData {
    pub id: String,
    pub date: String,
    pub start: String,
    pub end: String,
    pub activity: Option<String>,
    pub calories: Option<f32>,
    pub distance: Option<f32>,
    pub intensity: Option<String>,
}

pub async fn fetch_oura_workout_data(
    start_date: &str,
    end_date: &str,
) -> Result<Vec<WorkoutData>, String> {
    let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
    let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
    let base_url = base_url.trim_end_matches('/').to_string();
    let url = format!(
        "{}/usercollection/workout?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read error body".to_string());
        return Err(format!("Oura API error: {} - {}", status, err_text));
    }

    #[derive(Deserialize)]
    struct OuraWorkoutResponse {
        data: Vec<OuraWorkoutRecord>,
    }

    #[derive(Deserialize)]
    struct OuraWorkoutRecord {
        id: String,
        day: String,
        start_datetime: String,
        end_datetime: String,
        activity: Option<String>,
        calories: Option<f32>,
        distance: Option<f32>,
        intensity: Option<String>,
        // add other fields based on docs
    }

    let response: OuraWorkoutResponse = res.json().await.map_err(|e| e.to_string())?;
    let results = response
        .data
        .into_iter()
        .map(|rec| WorkoutData {
            id: rec.id,
            date: rec.day,
            start: rec.start_datetime,
            end: rec.end_datetime,
            activity: rec.activity,
            calories: rec.calories,
            distance: rec.distance,
            intensity: rec.intensity,
        })
        .collect();

    Ok(results)
}

pub async fn write_workout_to_file(workouts: &[WorkoutData]) -> Result<(), String> {
    let path = Path::new("vitals/workout.json");
    let mut existing: Vec<WorkoutData> = if path.exists() {
        let content = fs::read_to_string(path)
            .await
            .map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut map: HashMap<String, WorkoutData> =
        existing.into_iter().map(|w| (w.id.clone(), w)).collect();

    for w in workouts {
        map.insert(w.id.clone(), w.clone());
    }

    let merged: Vec<WorkoutData> = map.into_values().collect();
    let json =
        serde_json::to_string_pretty(&merged).map_err(|e| format!("Serialize error: {}", e))?;

    fs::create_dir_all("vitals")
        .await
        .map_err(|e| format!("mkdir error: {}", e))?;
    fs::write(path, json)
        .await
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

pub async fn fetch_oura_heart_rate_data(
    start: &str,
    end: &str,
) -> Result<Vec<HeartRateData>, String> {
    let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
    let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
    let base_url = base_url.trim_end_matches('/').to_string();
    let url = format!(
        "{}/usercollection/heartrate?start={}&end={}",
        base_url, start, end
    );

    let res = Client::new()
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraHeartRateResponse {
        data: Vec<HeartRateData>,
    }

    let response: OuraHeartRateResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn fetch_oura_vo2_data(start: &str, end: &str) -> Result<Vec<VO2Data>, String> {
    let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
    let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
    let base_url = base_url.trim_end_matches('/').to_string();
    let url = format!(
        "{}/usercollection/vO2_max?start_date={}&end_date={}",
        base_url, start, end
    );

    let res = Client::new()
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct VO2Response {
        data: Vec<VO2Data>,
    }

    let response: VO2Response = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn fetch_oura_stress_data(start: &str, end: &str) -> Result<Vec<StressData>, String> {
    let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
    let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
    let base_url = base_url.trim_end_matches('/').to_string();
    let url = format!(
        "{}/usercollection/daily_stress?start_date={}&end_date={}",
        base_url, start, end
    );

    let res = Client::new()
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read error body".to_string());
        return Err(format!("Oura API error: {} - {}", status, err_text));
    }

    #[derive(Deserialize)]
    struct StressResponse {
        data: Vec<StressData>,
    }

    let response: StressResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn write_heart_rate_to_file(data: &[HeartRateData]) -> Result<(), String> {
    let path = Path::new("vitals/heartrate.json");
    let json = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize error: {}", e))?;
    fs::create_dir_all("vitals")
        .await
        .map_err(|e| format!("mkdir error: {}", e))?;
    fs::write(path, json)
        .await
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

pub async fn write_vo2_to_file(data: &[VO2Data]) -> Result<(), String> {
    let path = Path::new("vitals/vo2.json");
    let json = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize error: {}", e))?;
    fs::create_dir_all("vitals")
        .await
        .map_err(|e| format!("mkdir error: {}", e))?;
    fs::write(path, json)
        .await
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

pub async fn write_stress_to_file(data: &[StressData]) -> Result<(), String> {
    let path = Path::new("vitals/stress.json");

    // Load existing data if file exists
    let mut existing_data: Vec<StressData> = if path.exists() {
        let content = fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Index by day
    let mut map: HashMap<String, StressData> = existing_data
        .into_iter()
        .map(|entry| (entry.day.clone(), entry))
        .collect();

    // Insert/overwrite with new data
    for entry in data {
        map.insert(entry.day.clone(), entry.clone());
    }

    // Save merged results
    let merged: Vec<StressData> = map.into_values().collect();
    let json = serde_json::to_string_pretty(&merged)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    fs::create_dir_all("vitals")
        .await
        .map_err(|e| format!("Failed to create vitals directory: {}", e))?;
    fs::write(path, json)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
