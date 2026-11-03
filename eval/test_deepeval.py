"""Offline DeepEval smoke test; no API calls, synthetic data only."""
from deepeval import assert_test
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

class RouteContractMetric(BaseMetric):
    def __init__(self, threshold=1.0):
        self.threshold = threshold
        self.async_mode = False
        self.score = 0.0
        self.success = False
        self.reason = "offline deterministic routing contract"
        self.error = None

    def measure(self, test_case: LLMTestCase):
        self.score = float(test_case.actual_output == test_case.expected_output)
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case):
        return self.measure(test_case)

    def is_successful(self):
        return self.error is None and self.success

    @property
    def __name__(self):
        return "EKODI offline route contract"

def test_offline_route_contract():
    case = LLMTestCase(input="이 요청을 로컬 모델로 라우팅해 줘", actual_output="node:ollama-local", expected_output="node:ollama-local")
    assert_test(case, [RouteContractMetric()], run_async=False)
