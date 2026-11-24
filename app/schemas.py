from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class LoginPayload(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False


class SetupPayload(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=10, max_length=256)


class PasswordChangePayload(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_email: Optional[str] = Field(default=None, min_length=3, max_length=160)
    new_password: Optional[str] = Field(default=None, min_length=10, max_length=256)


class MediaItem(BaseModel):
    url: str = Field(min_length=1, max_length=600)
    type: Literal["image", "video"] = "image"
    caption_pt: str = Field(default="", max_length=240)
    caption_en: str = Field(default="", max_length=240)


class ProjectPayload(BaseModel):
    display_type: Literal["card", "carousel", "video"] = "card"
    title_pt: str = Field(min_length=1, max_length=160)
    title_en: str = Field(default="", max_length=160)
    subtitle_pt: str = Field(default="", max_length=260)
    subtitle_en: str = Field(default="", max_length=260)
    description_pt: str = Field(default="", max_length=4000)
    description_en: str = Field(default="", max_length=4000)
    category: str = Field(default="UI/UX", max_length=80)
    client: str = Field(default="", max_length=120)
    year: str = Field(default="2026", max_length=20)
    role_pt: str = Field(default="", max_length=120)
    role_en: str = Field(default="", max_length=120)
    deliverables: list[str] = Field(default_factory=list)
    external_url: str = Field(default="", max_length=500)
    cover_url: str = Field(default="", max_length=600)
    video_url: str = Field(default="", max_length=600)
    media_items: list[MediaItem] = Field(default_factory=list)
    featured: bool = False
    status: Literal["published", "draft"] = "published"
    sort_order: int = 0


class ExperiencePayload(BaseModel):
    company: str = Field(min_length=1, max_length=140)
    role_pt: str = Field(min_length=1, max_length=140)
    role_en: str = Field(default="", max_length=140)
    period_pt: str = Field(min_length=1, max_length=80)
    period_en: str = Field(default="", max_length=80)
    location_pt: str = Field(default="", max_length=120)
    location_en: str = Field(default="", max_length=120)
    summary_pt: str = Field(default="", max_length=2000)
    summary_en: str = Field(default="", max_length=2000)
    highlights_pt: list[str] = Field(default_factory=list)
    highlights_en: list[str] = Field(default_factory=list)
    visible: bool = True
    sort_order: int = 0


class ProfilePayload(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    role_pt: str = Field(min_length=1, max_length=120)
    role_en: str = Field(default="", max_length=120)
    headline_pt: str = Field(default="", max_length=240)
    headline_en: str = Field(default="", max_length=240)
    bio_pt: str = Field(default="", max_length=2000)
    bio_en: str = Field(default="", max_length=2000)
    years_experience: int = Field(default=5, ge=0, le=60)
    location_pt: str = Field(default="", max_length=120)
    location_en: str = Field(default="", max_length=120)
    availability_pt: str = Field(default="", max_length=140)
    availability_en: str = Field(default="", max_length=140)
    available: bool = True
    email: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    whatsapp_url: str = Field(default="", max_length=300)
    behance_url: str = Field(default="", max_length=300)
    dribbble_url: str = Field(default="", max_length=300)
    linkedin_url: str = Field(default="", max_length=300)
    instagram_url: str = Field(default="", max_length=300)
    avatar_url: str = Field(default="", max_length=600)
    hero_image_url: str = Field(default="", max_length=600)


class ReorderPayload(BaseModel):
    ids: list[int] = Field(min_length=1)


class SignedUploadPayload(BaseModel):
    filename: str = Field(min_length=1, max_length=260)
    size: int = Field(ge=1)
    content_type: str = Field(default="application/octet-stream", max_length=120)
