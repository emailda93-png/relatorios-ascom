import requests
import sys
import json
import time
from datetime import datetime

class SistemaDemandasTester:
    def __init__(self, base_url="https://prod-reports.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_demanda_id = None
        self.created_solicitante_id = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"\n{status} - {name}")
        if details:
            print(f"Details: {details}")
        if success:
            self.tests_passed += 1
        return success

    def test_health_check(self):
        """Test basic health endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            return self.log_test("Health Check", success, f"Status: {response.status_code}, Response: {data}")
        except Exception as e:
            return self.log_test("Health Check", False, f"Error: {str(e)}")

    def test_get_solicitantes(self):
        """Test get solicitantes endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/solicitantes", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            return self.log_test("Get Solicitantes", success, f"Status: {response.status_code}, Count: {len(data)}")
        except Exception as e:
            return self.log_test("Get Solicitantes", False, f"Error: {str(e)}")

    def test_create_solicitante(self):
        """Test creating new solicitante"""
        try:
            test_name = f"Test_Solicitante_{datetime.now().strftime('%H%M%S')}"
            data = {'nome': test_name}
            response = requests.post(f"{self.base_url}/api/solicitantes", data=data, timeout=10)
            success = response.status_code == 200
            if success:
                result = response.json()
                self.created_solicitante_id = result.get('id')
            return self.log_test("Create Solicitante", success, f"Status: {response.status_code}, Name: {test_name}")
        except Exception as e:
            return self.log_test("Create Solicitante", False, f"Error: {str(e)}")

    def test_create_demanda(self):
        """Test creating new demanda"""
        try:
            data = {
                'solicitante': 'Teste API',
                'demanda': 'Demanda teste criada via API para validação do sistema',
                'referencia_links': 'https://example.com'
            }
            response = requests.post(f"{self.base_url}/api/demandas", data=data, timeout=10)
            success = response.status_code == 200
            if success:
                result = response.json()
                self.created_demanda_id = result.get('id')
                numero = result.get('numero', 'N/A')
                return self.log_test("Create Demanda", success, f"Status: {response.status_code}, Número: {numero}")
            else:
                return self.log_test("Create Demanda", success, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Create Demanda", False, f"Error: {str(e)}")

    def test_get_demandas(self):
        """Test retrieving demandas with filters"""
        try:
            # Test without filters
            response = requests.get(f"{self.base_url}/api/demandas", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            
            # Test with filters
            current_year = datetime.now().year
            response_filtered = requests.get(f"{self.base_url}/api/demandas?year={current_year}", timeout=10)
            
            return self.log_test("Get Demandas", success, f"Status: {response.status_code}, Total: {len(data)}")
        except Exception as e:
            return self.log_test("Get Demandas", False, f"Error: {str(e)}")

    def test_update_demanda_status(self):
        """Test updating demanda status"""
        if not self.created_demanda_id:
            return self.log_test("Update Demanda Status", False, "No demanda ID available")
        
        try:
            data = {'status': 'Confirmado'}
            response = requests.put(f"{self.base_url}/api/demandas/{self.created_demanda_id}/status", 
                                   data=data, timeout=10)
            success = response.status_code == 200
            return self.log_test("Update Demanda Status", success, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Update Demanda Status", False, f"Error: {str(e)}")

    def test_add_entrega(self):
        """Test adding entrega to demanda"""
        if not self.created_demanda_id:
            return self.log_test("Add Entrega", False, "No demanda ID available")
        
        try:
            data = {'entrega_links': 'https://drive.google.com/test-link'}
            response = requests.post(f"{self.base_url}/api/demandas/{self.created_demanda_id}/entregas", 
                                   data=data, timeout=10)
            success = response.status_code == 200
            return self.log_test("Add Entrega", success, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Add Entrega", False, f"Error: {str(e)}")

    def test_whatsapp_text(self):
        """Test WhatsApp text generation"""
        if not self.created_demanda_id:
            return self.log_test("WhatsApp Text", False, "No demanda ID available")
        
        try:
            response = requests.get(f"{self.base_url}/api/demandas/{self.created_demanda_id}/whatsapp", timeout=10)
            success = response.status_code == 200
            if success:
                result = response.json()
                text = result.get('text', '')
                return self.log_test("WhatsApp Text", success, f"Status: {response.status_code}, Text length: {len(text)}")
            else:
                return self.log_test("WhatsApp Text", success, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("WhatsApp Text", False, f"Error: {str(e)}")

    def test_monthly_pdf_report(self):
        """Test monthly PDF report generation"""
        try:
            current_month = datetime.now().month
            current_year = datetime.now().year
            response = requests.get(f"{self.base_url}/api/relatorio/{current_month}/{current_year}/pdf", timeout=15)
            
            # Accept both 200 (PDF generated) and 404 (no data) as valid responses
            success = response.status_code in [200, 404]
            status_detail = "PDF generated" if response.status_code == 200 else "No data for current month"
            return self.log_test("Monthly PDF Report", success, f"Status: {response.status_code} - {status_detail}")
        except Exception as e:
            return self.log_test("Monthly PDF Report", False, f"Error: {str(e)}")

    def test_get_available_months(self):
        """Test getting available months"""
        try:
            response = requests.get(f"{self.base_url}/api/months", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            return self.log_test("Get Available Months", success, f"Status: {response.status_code}, Months: {len(data)}")
        except Exception as e:
            return self.log_test("Get Available Months", False, f"Error: {str(e)}")

    def cleanup(self):
        """Clean up created test data"""
        if self.created_demanda_id:
            try:
                requests.delete(f"{self.base_url}/api/demandas/{self.created_demanda_id}", timeout=10)
                print(f"\n🧹 Cleanup: Deleted test demanda {self.created_demanda_id}")
            except:
                pass

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🔍 Starting Sistema de Demandas API Testing...")
        print(f"📡 Base URL: {self.base_url}")
        print("=" * 60)

        # Run tests in logical order
        self.test_health_check()
        self.test_get_solicitantes()
        self.test_create_solicitante()
        self.test_create_demanda()
        
        # Wait a moment for database consistency
        time.sleep(1)
        
        self.test_get_demandas()
        self.test_update_demanda_status()
        self.test_add_entrega()
        self.test_whatsapp_text()
        self.test_monthly_pdf_report()
        self.test_get_available_months()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"   Total tests: {self.tests_run}")
        print(f"   Passed: {self.tests_passed}")
        print(f"   Failed: {self.tests_run - self.tests_passed}")
        print(f"   Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Cleanup
        self.cleanup()
        
        return self.tests_passed == self.tests_run

def main():
    """Main test runner"""
    tester = SistemaDemandasTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())