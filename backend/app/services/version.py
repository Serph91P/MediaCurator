"""
Version management and update checking.
"""
import subprocess
import aiohttp
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from loguru import logger


class VersionService:
    """Service for version information and update checking."""
    
    def __init__(self):
        self._cached_version_info: Optional[Dict[str, Any]] = None
        self._cached_update_info: Optional[Dict[str, Any]] = None
        self._last_update_check: Optional[datetime] = None
        self._update_check_interval = timedelta(hours=1)  # Check every hour
    
    def get_git_info(self) -> Dict[str, Any]:
        """Get current Git information (branch, commit, status)."""
        if self._cached_version_info:
            return self._cached_version_info
        
        info = {
            "version": "unknown",  # Will be determined from git tags
            "branch": "unknown",
            "commit_hash": "unknown",
            "commit_short": "unknown",
            "commit_date": None,
            "is_dirty": False,
            "remote_url": None,
        }
        
        try:
            # Configure git to trust the directory (fixes ownership issues in Docker)
            config_result = subprocess.run(
                ["git", "config", "--global", "--add", "safe.directory", "/app"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            logger.debug(f"Git config result: {config_result.returncode}, stderr: {config_result.stderr}")
            
            # Get version from git tags
            # Strategy: Get latest dev tag from all tags (not just reachable ones)
            # This shows the "latest available version" even if we're on an older commit
            result = subprocess.run(
                ["git", "tag", "--list", "vdev.*", "--sort=-version:refname"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            
            if result.returncode == 0 and result.stdout.strip():
                tags = result.stdout.strip().split('\n')
                if tags and tags[0]:
                    tag = tags[0]  # First tag is the latest
                    info["version"] = tag[1:] if tag.startswith('v') else tag
                    logger.debug(f"Latest dev tag: {info['version']}")
            else:
                # Fallback: check for main version tags (v0.x.x)
                result = subprocess.run(
                    ["git", "tag", "--list", "v[0-9]*", "--sort=-version:refname"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    cwd="/app"
                )
                if result.returncode == 0 and result.stdout.strip():
                    tags = result.stdout.strip().split('\n')
                    if tags and tags[0]:
                        tag = tags[0]
                        info["version"] = tag[1:] if tag.startswith('v') else tag
                        logger.debug(f"Latest main tag: {info['version']}")
                else:
                    # Last fallback: use git describe or commit hash
                    result = subprocess.run(
                        ["git", "describe", "--tags", "--always"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        cwd="/app"
                    )
                    if result.returncode == 0:
                        desc = result.stdout.strip()
                        info["version"] = desc[1:] if desc.startswith('v') else desc
                        logger.debug(f"Fallback version: {info['version']}")

            
            # Get current branch
            result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            logger.debug(f"Git branch result: {result.returncode}, stdout: {result.stdout}, stderr: {result.stderr}")
            if result.returncode == 0:
                info["branch"] = result.stdout.strip()
            
            # Get commit hash (full)
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            if result.returncode == 0:
                info["commit_hash"] = result.stdout.strip()
            
            # Get short commit hash
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            if result.returncode == 0:
                info["commit_short"] = result.stdout.strip()
            
            # Get commit date
            result = subprocess.run(
                ["git", "log", "-1", "--format=%ci"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            if result.returncode == 0:
                info["commit_date"] = result.stdout.strip()
            
            # Check if working directory is dirty
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            if result.returncode == 0:
                info["is_dirty"] = bool(result.stdout.strip())
            
            # Get remote URL
            result = subprocess.run(
                ["git", "config", "--get", "remote.origin.url"],
                capture_output=True,
                text=True,
                timeout=5,
                cwd="/app"
            )
            if result.returncode == 0:
                remote_url = result.stdout.strip()
                # Convert SSH to HTTPS format for GitHub
                if remote_url.startswith("git@github.com:"):
                    remote_url = remote_url.replace("git@github.com:", "https://github.com/")
                if remote_url.endswith(".git"):
                    remote_url = remote_url[:-4]
                info["remote_url"] = remote_url
            
            # Build full version string
            # Format: version-commit or version-commit-dirty (branch already in version for dev builds)
            version_parts = [info["version"], info["commit_short"]]
            if info["is_dirty"]:
                version_parts.append("dirty")
            
            info["full_version"] = "-".join(version_parts)
            info["base_version"] = info["version"]  # Store base version separately
            logger.info(f"Version info collected: {info['full_version']}")
            
        except Exception as e:
            logger.warning(f"Failed to get Git info: {e}")
            # Set fallback full_version
            info["full_version"] = f"{info['version']}-{info['commit_short']}"
        
        self._cached_version_info = info
        return info
    
    async def check_for_updates(self) -> Dict[str, Any]:
        """Check if updates are available on GitHub."""
        # Return cached result if check was recent
        if self._last_update_check:
            time_since_check = datetime.utcnow() - self._last_update_check
            if time_since_check < self._update_check_interval:
                return self._cached_update_info or {"update_available": False}
        
        git_info = self.get_git_info()
        update_info = {
            "update_available": False,
            "latest_commit": None,
            "commits_behind": 0,
            "error": None
        }
        
        # Extract owner/repo from remote URL
        remote_url = git_info.get("remote_url")
        if not remote_url or "github.com" not in remote_url:
            update_info["error"] = "Not a GitHub repository or no remote configured"
            self._cached_update_info = update_info
            return update_info
        
        try:
            # Parse owner/repo from URL
            # Format: https://github.com/owner/repo
            parts = remote_url.replace("https://github.com/", "").split("/")
            if len(parts) < 2:
                update_info["error"] = "Invalid GitHub URL format"
                return update_info
            
            owner, repo = parts[0], parts[1]
            branch = git_info.get("branch", "main")
            current_commit = git_info.get("commit_hash", "")
            
            # GitHub API: Get latest commit on branch
            api_url = f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}"
            
            async with aiohttp.ClientSession() as session:
                headers = {
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "MediaCleanup-UpdateChecker"
                }
                
                async with session.get(api_url, headers=headers, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        latest_commit = data.get("sha", "")
                        
                        update_info["latest_commit"] = latest_commit[:7]  # Short hash
                        
                        # Check if we're behind
                        if latest_commit and current_commit:
                            if latest_commit != current_commit:
                                update_info["update_available"] = True
                                
                                # Try to get number of commits behind
                                compare_url = f"https://api.github.com/repos/{owner}/{repo}/compare/{current_commit[:7]}...{branch}"
                                async with session.get(compare_url, headers=headers, timeout=10) as compare_response:
                                    if compare_response.status == 200:
                                        compare_data = await compare_response.json()
                                        update_info["commits_behind"] = compare_data.get("ahead_by", 0)
                    
                    elif response.status == 404:
                        update_info["error"] = "Repository or branch not found on GitHub"
                    else:
                        update_info["error"] = f"GitHub API error: {response.status}"
        
        except asyncio.TimeoutError:
            update_info["error"] = "Timeout connecting to GitHub"
        except Exception as e:
            logger.warning(f"Failed to check for updates: {e}")
            update_info["error"] = str(e)
        
        self._last_update_check = datetime.utcnow()
        self._cached_update_info = update_info
        return update_info
    
    def get_version_info(self) -> Dict[str, Any]:
        """Get complete version information."""
        git_info = self.get_git_info()
        return {
            "version": git_info["full_version"],
            "base_version": git_info["version"],
            "branch": git_info["branch"],
            "commit": git_info["commit_short"],
            "commit_full": git_info["commit_hash"],
            "commit_date": git_info["commit_date"],
            "is_dirty": git_info["is_dirty"],
            "remote_url": git_info["remote_url"]
        }


# Global instance
version_service = VersionService()
