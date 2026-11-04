"""The ops copilot's offline path on the toy artifacts: tools, quick replies and attachments."""

from types import SimpleNamespace

import pytest

from pulse_api.batch import frame_to_records, read_records_csv
from pulse_copilot.agent import Copilot
from pulse_copilot.answer import Conversation
from pulse_copilot.prompts import SYSTEM_INSTRUCTION
from pulse_copilot.quick import ACTIONS, quick_answer
from pulse_copilot.tools import build_tools
from pulse_copilot.workspace import Workspace


@pytest.fixture()
def workspace(tmp_path, pipeline_out):
    return Workspace(tmp_path, pipeline_out, tmp_path / "runs")


def test_tools_read_the_artifacts_and_cite_sources(workspace):
    tools = {f.__name__: f for f in build_tools(workspace, Conversation())}
    assert len(tools) == 8
    contract = tools["get_contract"]()
    assert contract["required_features"] == ["x_num", "x_cat"]
    assert contract["source"] == ["dataset_contract.json"]
    metrics = tools["get_model_metrics"]()
    assert metrics["selected_model"] in {"logistic regression", "gradient boosting"}
    assert "positive_rate_in_riskiest_10pct" in next(iter(metrics["candidates"].values()))
    card = tools["read_document"]("model_card", "Limitations")
    assert card["section"] == "Limitations" and card["text"]
    assert tools["get_gate_checks"]("nope")["error"].startswith("unknown gate")


def test_quick_replies_work_without_an_llm(workspace, bundle):
    conversation = Conversation()
    csv = b"row_id,x_num,x_cat,x_flag,x_num_sq\nr1,2.0,a,0,4.0\nr2,-2.0,c,1,4.0\n"
    records, ignored = frame_to_records(bundle, read_records_csv(bundle, csv))
    conversation.attachment = {"name": "toy.csv", "records": records, "ignored": ignored}
    for action in ACTIONS:
        answer = quick_answer(action, workspace, conversation)
        assert answer.offline and answer.text, action
    scored = quick_answer("attachment", workspace, conversation)
    assert "2 of 2 rows scored" in scored.text
    assert scored.outputs and scored.outputs[0]["result"].summary["scored"] == 2
    assert "model.joblib" in scored.sources


def test_workspace_reads_the_customer_folders_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path / "artifacts"))
    monkeypatch.setenv("RUNS_DIR", str(tmp_path / "runs"))
    workspace = Workspace.from_env()
    assert workspace.artifacts == tmp_path / "artifacts"
    assert workspace.runs == tmp_path / "runs"


class FakeModels:
    """Gemini with automatic function calling: it calls one tool, then answers."""

    def __init__(self, error=None):
        self.error, self.configs = error, []

    def generate_content(self, *, model, contents, config):
        self.configs.append(config)
        if self.error:
            raise self.error
        tools = {f.__name__: f for f in config.tools}
        tools["get_model_metrics"]()
        usage = SimpleNamespace(
            prompt_token_count=10, candidates_token_count=5, total_token_count=15
        )
        return SimpleNamespace(text="The model is fine. ", usage_metadata=usage)


def test_the_copilot_asks_with_its_instruction_and_tools(workspace):
    models = FakeModels()
    answer = Copilot(workspace, client=SimpleNamespace(models=models)).ask("How is the model?")
    config = models.configs[0]
    assert config.system_instruction == SYSTEM_INSTRUCTION
    assert len(config.tools) == 8
    assert answer.text == "The model is fine."
    assert [call.name for call in answer.tool_calls] == ["get_model_metrics"]
    assert "metrics.json" in answer.sources and answer.ungrounded == []
    assert answer.usage == {"prompt_tokens": 10, "output_tokens": 5, "total_tokens": 15}


def test_a_failed_call_is_a_readable_answer(workspace):
    quota = Exception("429 RESOURCE_EXHAUSTED")
    quota.code = 429
    client = SimpleNamespace(models=FakeModels(error=quota))
    answer = Copilot(workspace, client=client).ask("How is the model?")
    assert answer.error == "Exception" and "quota" in answer.text
