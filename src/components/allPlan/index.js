import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Table, Button } from 'antd';

class AllPlan extends Component {
  static propTypes = {
    username: PropTypes.string,
    userToken: PropTypes.string,
    removeUser: PropTypes.func,
  }
  state = {
    columns: [{
      title: '创建时间',
      dataIndex: 'creatime',
      key: 'creatime',
    }, {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    }, {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      render: status => {
        var statusList = ['进行中', '已完成', '暂停', '终止', '超时', '未开始'];
        return (
          <span>{statusList[status]}</span>
        )
      }
    }, {
      title: '详情',
      key: 'des',
      dataIndex: 'des',
    }, {
      title: '操作',
      key: 'action',
      render: (text, record) => (
        <span>
          <Button type="primary" className="m-2">完成</Button>
          <Button type="primary" className="m-2">封存</Button>
          <Button type="primary" className="m-2">删除</Button>
        </span>
      ),
    }],
    
  }

  componentDidMount() {
    setTimeout(() => {
      this.props.test()
    }, 5000);
    
    if (!this.props.username || !this.props.userToken) {
      // this.props.removeUser();
      
    }
    // this.props.getTasks(this.props.userToken);
   
  }

  render() {
    return (
      <Table rowKey="id" columns={this.state.columns} dataSource={this.props.tasks} />
    )
  }
}
export default AllPlan;