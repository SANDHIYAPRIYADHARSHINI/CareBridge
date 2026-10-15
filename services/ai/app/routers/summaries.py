from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.schemas.chat import Citation
from app.schemas.common import Metrics
from app.schemas.summary import SummaryRequest, SummaryResponse, SummarySentence

router = APIRouter(prefix="/v1/summaries", tags=["Summaries"])


@router.post("", response_model=SummaryResponse)
async def create_summary(
    request: Request,
    body: SummaryRequest,
    settings: Settings = Depends(get_settings),
) -> SummaryResponse:
    if settings.MOCK_MODE:
        doc = body.document
        doc_id = doc.doc_id

        sentences = [
            SummarySentence(
                text=(
                    "The prescription prescribes three daily medications for blood sugar, "
                    "cholesterol, and blood pressure control."
                ),
                citation_ids=["s1"],
            ),
            SummarySentence(
                text=(
                    "Follow-up consultation is scheduled in 4 weeks with fasting blood sugar "
                    "and lipid profile tests."
                ),
                citation_ids=["s2"],
            ),
        ]
        citations = [
            Citation(
                id="s1",
                doc_id=doc_id,
                quote="Tab Metformin 500mg, Tab Atorvastatin 10mg, Tab Amlodipine 5mg",
            ),
            Citation(
                id="s2",
                doc_id=doc_id,
                quote="Follow up in 4 weeks with fasting blood sugar and lipid profile",
            ),
        ]
        return SummaryResponse(
            summary_sentences=sentences,
            missing=[],
            inconsistencies=[],
            citations=citations,
            reading_level=7.5,
            metrics=Metrics(
                latency_ms=290.0,
                model=settings.LLM_MODEL,
                tokens_in=500,
                tokens_out=90,
                gpu="AMD Instinct MI300X",
            ),
        )

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": "Summaries pipeline active in milestone P6.",
                "retryable": False,
            }
        },
    )
