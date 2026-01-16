"""
Libraries API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ...core.database import get_db
from ...models import Library
from ...schemas import LibraryCreate, LibraryUpdate, LibraryResponse
from ..deps import get_current_user

router = APIRouter(prefix="/libraries", tags=["Libraries"])


@router.get("/", response_model=List[LibraryResponse])
async def list_libraries(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all libraries."""
    result = await db.execute(select(Library))
    return result.scalars().all()


@router.post("/", response_model=LibraryResponse, status_code=status.HTTP_201_CREATED)
async def create_library(
    library_data: LibraryCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new library."""
    library = Library(**library_data.model_dump())
    db.add(library)
    await db.commit()
    await db.refresh(library)
    return library


@router.get("/{library_id}", response_model=LibraryResponse)
async def get_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    return library


@router.put("/{library_id}", response_model=LibraryResponse)
async def update_library(
    library_id: int,
    library_data: LibraryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    update_data = library_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(library, key, value)
    
    await db.commit()
    await db.refresh(library)
    return library


@router.delete("/{library_id}")
async def delete_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    await db.delete(library)
    await db.commit()
    return {"message": "Library deleted"}
