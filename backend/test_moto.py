import boto3
from botocore.stub import Stubber


def test_list_buckets():
    """Use botocore Stubber to mock S3 list_buckets for a fast local test."""
    s3 = boto3.client('s3', region_name='us-east-1')
    stubber = Stubber(s3)
    expected = {
        'Buckets': [
            {'Name': 'test-bucket-1'},
            {'Name': 'test-bucket-2'}
        ],
        'Owner': {'DisplayName': 'owner', 'ID': 'abc123'}
    }
    stubber.add_response('list_buckets', expected)
    stubber.activate()

    resp = s3.list_buckets()
    names = [b['Name'] for b in resp.get('Buckets', [])]
    assert 'test-bucket-1' in names
    assert 'test-bucket-2' in names

    stubber.deactivate()


if __name__ == '__main__':
    test_list_buckets()
    print('stubber test passed')
