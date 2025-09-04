#!/usr/bin/env python3
"""
Monitor thumbnail generation progress in real-time
"""
import os
import sys
import time
from datetime import datetime

# Add backend to path
sys.path.append('/app')
sys.path.append('.')

try:
    from backend.models import SessionLocal, Job
    
    def monitor_thumbnail_progress():
        """Monitor thumbnail job progress with live updates"""
        print("=== THUMBNAIL GENERATION MONITOR ===")
        print("Press Ctrl+C to stop monitoring")
        print()
        
        session = SessionLocal()
        last_processed = 0
        start_time = time.time()
        
        try:
            while True:
                # Get current job
                job = session.query(Job).filter(Job.type == 'thumbnailing', Job.status == 'running').first()
                
                if not job:
                    print("No running thumbnail job found.")
                    break
                
                # Calculate progress
                processed = job.processed_items or 0
                total = job.total_items or 0
                progress_pct = job.progress or 0
                
                # Calculate rate
                elapsed = time.time() - start_time
                if elapsed > 0:
                    items_since_start = processed - last_processed if last_processed == 0 else processed - last_processed
                    rate = items_since_start / elapsed if elapsed > 0 else 0
                else:
                    rate = 0
                
                # Estimate completion time
                if rate > 0 and total > processed:
                    remaining_items = total - processed
                    eta_seconds = remaining_items / rate
                    eta_minutes = eta_seconds / 60
                    eta_hours = eta_minutes / 60
                    
                    if eta_hours >= 1:
                        eta_str = f"{eta_hours:.1f} hours"
                    elif eta_minutes >= 1:
                        eta_str = f"{eta_minutes:.1f} minutes"
                    else:
                        eta_str = f"{eta_seconds:.0f} seconds"
                else:
                    eta_str = "calculating..."
                
                # Clear line and show progress
                print(f"\r[{datetime.now().strftime('%H:%M:%S')}] "
                      f"Progress: {processed:,}/{total:,} ({progress_pct}%) | "
                      f"Rate: {rate:.1f}/min | "
                      f"ETA: {eta_str}", end="", flush=True)
                
                if last_processed == 0:
                    last_processed = processed
                
                # Refresh database session occasionally
                if int(time.time()) % 30 == 0:
                    session.close()
                    session = SessionLocal()
                
                time.sleep(5)  # Update every 5 seconds
                
        except KeyboardInterrupt:
            print("\nMonitoring stopped.")
        finally:
            session.close()
    
    def show_job_details():
        """Show detailed job information"""
        session = SessionLocal()
        try:
            job = session.query(Job).filter(Job.type == 'thumbnailing').order_by(Job.created_at.desc()).first()
            
            if job:
                print(f"Job ID: {job.id}")
                print(f"Status: {job.status}")
                print(f"Progress: {job.progress}%")
                print(f"Items: {job.processed_items}/{job.total_items}")
                print(f"Created: {job.created_at}")
                print(f"Started: {job.started_at}")
                if job.error_message:
                    print(f"Error: {job.error_message}")
                print()
            else:
                print("No thumbnail jobs found.")
                
        finally:
            session.close()
    
    if __name__ == "__main__":
        if len(sys.argv) > 1 and sys.argv[1] == "details":
            show_job_details()
        else:
            monitor_thumbnail_progress()
        
except ImportError as e:
    print(f"Import error: {e}")
    print("This script needs to be run from the backend container")