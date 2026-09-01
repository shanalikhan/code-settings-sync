
from typing import List, Optional
from dataclasses import dataclass
from dataclasses import field
import copy

@dataclass
class ExtensionInfo:
    name: str
    id: str
    version: str
    enabled: bool = True
    disabled: Optional[bool] = None

class CodeSettingsSync:
    def __init__(self) -> None:
        self.extensions: List[ExtensionInfo] = []
    
    def _get_all_extensions(self) -> List[ExtensionInfo]:
        """Get all extensions including disabled ones from VS Code API."""
        try:
            all_extensions = list(extensions.all) if hasattr(extensions, 'all') else []
            processed: List[ExtensionInfo] = []
            
            for ext in all_extensions:
                if ext and isinstance(ext, ExtensionInfo):
                    ext.enabled = True
                    ext.disabled = ext.disabled if hasattr(ext, 'disabled') else None
                    
                    # Handle disabled status from VS Code API
                    if hasattr(ext, 'state') and ext.state == 'disabled':
                        ext.disabled = True
                        ext.enabled = False
                    
                    processed.append(ext)
                elif hasattr(ext, 'name'):
                    processed.append(ExtensionInfo(
                        name=ext.name,
                        id=ext.id,
                        version=str(ext.version),
                        enabled=True if not getattr(ext, 'disabled', None) else False,
                        disabled=getattr(ext, 'disabled', None)
                    ))
                
            return processed
        except Exception:
            return []
    
    def sync_extensions(self, source_extensions: List[dict], target_extensions: List[ExtensionInfo]) -> None:
        """Sync extensions considering disabled states between source and target."""
        if not target_extensions:
            return
        
        for ext in target_extensions:
            if ext.name in source_extensions:
                source = source_extensions[ext.name]
                
                # If source was enabled but target is disabled, mark as disabled
                if getattr(source, 'enabled', True) and getattr(ext, 'disabled', False):
                    ext.enabled = True
                    ext.disabled = True
                
            elif not ext.enabled:
                ext.enabled = True
                ext.disabled = True
    
    def get_synced_extensions(self, include_disabled: bool = True) -> List[ExtensionInfo]:
        """Get extensions for sync, optionally including disabled ones."""
        all_extensions = self._get_all_extensions()
        
        if not include_disabled:
            filtered = [ext for ext in all_extensions if ext.enabled]
            return filtered
        
        return all_extensions
    
    def register_extension(self, ext: dict) -> None:
        """Register a single extension with proper disabled state handling."""
        extension = ExtensionInfo(
            name=ext.get('name', ext.get('id', '')),
            id=ext.get('id', ext.get('name', '')),
            version=ext.get('version', '0.0.0'),
            enabled=ext.get('enabled', True),
            disabled=ext.get('disabled', None)
        )
        
        self.extensions.append(extension)
    
    def filter_enabled(self, include_disabled: bool = True) -> List[ExtensionInfo]:
        """Filter extensions based on enabled/disabled state."""
        if include_disabled:
            return self.extensions
        
        return [ext for ext in self.extensions if ext.enabled]
    
    def refresh_extensions(self) -> List[ExtensionInfo]:
        """Refresh the extension list considering current VS Code disabled state."""
        self.extensions = self._get_all_extensions()
        return self.extensions

# Initialize the class for usage
code_sync: Optional[CodeSettingsSync] = CodeSettingsSync()
